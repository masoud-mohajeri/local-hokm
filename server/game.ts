import { randomInt, randomUUID } from 'node:crypto';
import type { Card, Phase, Play, Player, RoomView, Suit } from '../shared/types.js';

export const suits: Suit[] = ['spades', 'hearts', 'clubs', 'diamonds'];
type Member = Player & { token: string; socketId: string | null; joined: number };

export class Game {
  players: (Member | null)[] = [null, null, null, null];
  managerId: string | null = null;
  phase: Phase = 'lobby';
  hands: Card[][] = [[], [], [], []];
  deck: Card[] = [];
  hakem = 0;
  trump: Suit | null = null;
  turn = 0;
  trick: Play[] = [];
  tricks = [0, 0];
  scores = [0, 0];
  winner: number | null = null;
  lastTrickWinner: number | null = null;
  timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private publish: () => void) {}

  get paused() { return this.phase !== 'lobby' && this.players.some(p => !p?.connected); }
  seat(socketId: string) { return this.players.findIndex(p => p?.socketId === socketId); }
  requirePlayer(socketId: string) {
    const seat = this.seat(socketId);
    if (seat < 0) throw new Error('ابتدا وارد اتاق شوید.');
    return seat;
  }
  requireManager(socketId: string) {
    const seat = this.requirePlayer(socketId);
    if (this.players[seat]!.id !== this.managerId) throw new Error('این کار فقط برای مدیر است.');
  }
  requireReady() {
    if (this.players.some(p => !p?.connected)) throw new Error('منتظر اتصال هر چهار نفر هستیم.');
  }
  electManager() {
    if (this.players.some(p => p?.id === this.managerId && p.connected)) return;
    this.managerId = this.players.filter((p): p is Member => !!p?.connected)
      .sort((a, b) => a.joined - b.joined)[0]?.id ?? null;
  }
  join(socketId: string, name: unknown, token: unknown) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100)
      throw new Error('شناسه اتصال نامعتبر است؛ صفحه را دوباره باز کنید.');
    if (this.seat(socketId) >= 0) return;
    const existing = this.players.find(p => p?.token === token);
    if (existing) {
      if (existing.connected) throw new Error('این بازیکن در برگه دیگری متصل است.');
      existing.socketId = socketId;
      existing.connected = true;
    } else {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 24)
        throw new Error('نامی بین ۱ تا ۲۴ حرف وارد کنید.');
      const empty = this.players.indexOf(null);
      if (empty < 0) throw new Error('اتاق پر است؛ هر چهار صندلی رزرو شده‌اند.');
      if (this.phase !== 'lobby') throw new Error('بازی شروع شده است.');
      this.players[empty] = { id: randomUUID(), name: name.trim(), token, socketId, connected: true, joined: Date.now() };
    }
    this.electManager();
  }
  disconnect(socketId: string) {
    const seat = this.seat(socketId);
    if (seat < 0) return;
    this.players[seat]!.connected = false;
    this.players[seat]!.socketId = null;
    this.electManager();
  }
  leave(socketId: string) {
    const seat = this.requirePlayer(socketId);
    if (this.phase !== 'lobby') throw new Error('برای خروج، ابتدا بازی را بازنشانی کنید.');
    this.players[seat] = null;
    this.electManager();
  }
  swap(socketId: string, from: unknown, to: unknown) {
    this.requireManager(socketId);
    if (this.phase !== 'lobby') throw new Error('جابجایی فقط پیش از بازی ممکن است.');
    if (!this.validSeat(from) || !this.validSeat(to)) throw new Error('صندلی نامعتبر است.');
    [this.players[from], this.players[to]] = [this.players[to], this.players[from]];
  }
  validSeat(value: unknown): value is number { return Number.isInteger(value) && Number(value) >= 0 && Number(value) < 4; }
  remove(socketId: string, seat: unknown) {
    this.requireManager(socketId);
    if (this.phase !== 'lobby' || !this.validSeat(seat) || !this.players[seat] || this.players[seat]!.connected)
      throw new Error('فقط بازیکن قطع‌شده در انتظار بازی را می‌توان حذف کرد.');
    this.players[seat] = null;
  }
  start(socketId: string) {
    this.requireManager(socketId);
    this.requireReady();
    if (this.phase !== 'lobby') throw new Error('بازی شروع شده است.');
    this.scores = [0, 0];
    this.hakem = randomInt(4);
    this.deal();
  }
  deal() {
    this.deck = suits.flatMap(suit => Array.from({ length: 13 }, (_, i) => ({ id: `${suit}-${i + 2}`, suit, rank: i + 2 })));
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
    this.hands = [[], [], [], []];
    this.tricks = [0, 0];
    this.trick = [];
    this.trump = null;
    this.winner = null;
    this.lastTrickWinner = null;
    this.turn = this.hakem;
    this.dealBatch(5);
    this.phase = 'trump';
  }
  dealBatch(count: number) {
    for (let offset = 0; offset < 4; offset++) {
      const seat = (this.hakem + offset) % 4;
      this.hands[seat].push(...this.deck.splice(0, count));
    }
  }
  chooseTrump(socketId: string, suit: unknown) {
    const seat = this.requirePlayer(socketId);
    this.requireReady();
    if (this.phase !== 'trump' || seat !== this.hakem || !suits.includes(suit as Suit))
      throw new Error('انتخاب حکم ممکن نیست.');
    this.trump = suit as Suit;
    this.dealBatch(4);
    this.dealBatch(4);
    this.phase = 'playing';
  }
  play(socketId: string, cardId: unknown) {
    const seat = this.requirePlayer(socketId);
    this.requireReady();
    if (this.phase !== 'playing' || this.turn !== seat) throw new Error('نوبت شما نیست.');
    const index = this.hands[seat].findIndex(c => c.id === cardId);
    if (index < 0) throw new Error('کارت نامعتبر است.');
    const card = this.hands[seat][index];
    const led = this.trick[0]?.card.suit;
    if (led && card.suit !== led && this.hands[seat].some(c => c.suit === led))
      throw new Error('باید از خال شروع‌شده بازی کنید.');
    this.hands[seat].splice(index, 1);
    this.trick.push({ seat, card });
    if (this.trick.length < 4) { this.turn = (seat + 1) % 4; return; }
    this.phase = 'trickEnd';
    let best = this.trick[0];
    for (const play of this.trick.slice(1)) {
      if ((play.card.suit === best.card.suit && play.card.rank > best.card.rank) ||
        (play.card.suit === this.trump && best.card.suit !== this.trump)) best = play;
    }
    this.lastTrickWinner = best.seat;
    this.timer = setTimeout(() => { this.finishTrick(best.seat); this.publish(); }, 1600);
  }
  finishTrick(seat: number) {
    this.timer = undefined;
    const team = seat % 2;
    this.tricks[team]++;
    this.turn = seat;
    if (this.tricks[team] === 7) {
      this.winner = team;
      this.scores[team] += this.tricks[1 - team] === 0 ? (team === this.hakem % 2 ? 2 : 3) : 1;
      this.phase = this.scores[team] >= 7 ? 'matchEnd' : 'handEnd';
    } else {
      this.trick = [];
      this.phase = 'playing';
    }
  }
  next(socketId: string) {
    this.requireManager(socketId);
    this.requireReady();
    if (this.phase !== 'handEnd') throw new Error('دست هنوز تمام نشده است.');
    if (this.winner !== this.hakem % 2) this.hakem = (this.hakem + 1) % 4;
    this.deal();
  }
  reset(socketId: string) {
    this.requireManager(socketId);
    clearTimeout(this.timer);
    this.timer = undefined;
    this.phase = 'lobby';
    this.hands = [[], [], [], []];
    this.deck = [];
    this.trick = [];
    this.tricks = [0, 0];
    this.scores = [0, 0];
    this.trump = null;
    this.winner = null;
    this.lastTrickWinner = null;
    this.hakem = this.turn = 0;
  }
  view(socketId: string): RoomView {
    const seat = this.seat(socketId);
    return {
      players: this.players.map(p => p ? { id: p.id, name: p.name, connected: p.connected } : null),
      managerId: this.managerId, you: this.players[seat]?.id ?? null, phase: this.phase,
      hand: seat < 0 ? [] : this.hands[seat], handCounts: this.hands.map(h => h.length),
      hakem: this.hakem, trump: this.trump, turn: this.turn, trick: this.trick, tricks: this.tricks,
      scores: this.scores, paused: this.paused, winner: this.winner, lastTrickWinner: this.lastTrickWinner,
    };
  }
}
