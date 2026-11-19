export type Suit = 'spades' | 'hearts' | 'clubs' | 'diamonds';
export type Card = { id: string; suit: Suit; rank: number };
export type Player = { id: string; name: string; connected: boolean };
export type Play = { seat: number; card: Card };
export type Phase = 'lobby' | 'trump' | 'playing' | 'trickEnd' | 'handEnd' | 'matchEnd';
export interface RoomView {
  players: (Player | null)[];
  managerId: string | null;
  you: string | null;
  phase: Phase;
  hand: Card[];
  handCounts: number[];
  hakem: number;
  trump: Suit | null;
  turn: number;
  trick: Play[];
  tricks: number[];
  scores: number[];
  paused: boolean;
  winner: number | null;
  lastTrickWinner: number | null;
}
export interface ClientEvents {
  join: (data: { name: string; token: string }, ack: (result: { error?: string }) => void) => void;
  start: () => void;
  swap: (data: { from: number; to: number }) => void;
  trump: (suit: Suit) => void;
  play: (cardId: string) => void;
  next: () => void;
  reset: () => void;
  remove: (seat: number) => void;
  leave: () => void;
}
export interface ServerEvents {
  state: (state: RoomView) => void;
  notice: (message: string) => void;
}
