import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io, type Socket } from 'socket.io-client';
import type { Card, ClientEvents, RoomView, ServerEvents, Suit } from '../shared/types';
import './style.css';

const socket: Socket<ServerEvents, ClientEvents> = io({ autoConnect: false });
const suits: Suit[] = ['spades', 'hearts', 'clubs', 'diamonds'];
const symbols: Record<Suit, string> = { spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦' };
const suitNames: Record<Suit, string> = { spades: 'پیک', hearts: 'دل', clubs: 'گشنیز', diamonds: 'خشت' };
const fa = (n: number) => n.toLocaleString('fa-IR');
const faceRanks: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const rank = (n: number) => faceRanks[n] ?? String(n);
const red = (suit: Suit) => suit === 'hearts' || suit === 'diamonds';

function identity() {
  let token = localStorage.getItem('hokm-token');
  if (!token) {
    // getRandomValues works on plain HTTP LAN addresses, unlike randomUUID.
    token = Array.from(crypto.getRandomValues(new Uint8Array(24)), n => n.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('hokm-token', token);
  }
  return token;
}

function CardFace({ card }: { card: Card }) {
  return <span className={`card-face ${red(card.suit) ? 'red' : ''}`} dir="ltr"><b>{rank(card.rank)}</b><span>{symbols[card.suit]}</span></span>;
}

function App() {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [online, setOnline] = useState(false);
  const [name, setName] = useState(() => localStorage.getItem('hokm-name') ?? '');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [swapFrom, setSwapFrom] = useState<number | null>(null);
  const [help, setHelp] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  function join(playerName: string) {
    try {
      setJoining(true);
      socket.timeout(6000).emit('join', { name: playerName, token: identity() }, (timeoutError: Error | null, result: { error?: string }) => {
        setJoining(false);
        if (timeoutError || result?.error) { setError(result?.error ?? 'پاسخی دریافت نشد؛ دوباره تلاش کنید.'); return; }
        localStorage.setItem('hokm-name', playerName.trim());
        setError('');
      });
    } catch { setJoining(false); setError('ذخیره‌سازی مرورگر در دسترس نیست.'); }
  }

  useEffect(() => {
    const connected = () => {
      setOnline(true);
      const saved = localStorage.getItem('hokm-name');
      if (saved) join(saved);
    };
    const disconnected = () => { setOnline(false); setPending(null); };
    const state = (value: RoomView) => { setRoom(value); setPending(null); };
    const notice = (message: string) => { setError(message); setPending(null); };
    socket.on('connect', connected);
    socket.on('disconnect', disconnected);
    socket.on('state', state);
    socket.on('notice', notice);
    socket.connect();
    return () => {
      socket.off('connect', connected); socket.off('disconnect', disconnected);
      socket.off('state', state); socket.off('notice', notice); socket.disconnect();
    };
  }, []);

  const me = room?.players.findIndex(p => p?.id === room.you) ?? -1;
  const manager = !!room?.you && room.you === room.managerId;
  const lobby = room?.phase === 'lobby';
  const active = !!room && !lobby;
  const ready = room?.players.every(p => p?.connected);
  const myTurn = room?.phase === 'playing' && room.turn === me && !room.paused && online;
  const led = room?.trick[0]?.card.suit;
  const mustFollow = !!led && room?.hand.some(c => c.suit === led);
  const hand = [...(room?.hand ?? [])].sort((a, b) => suits.indexOf(a.suit) - suits.indexOf(b.suit) || b.rank - a.rank);
  const relative = (seat: number) => (seat - Math.max(me, 0) + 4) % 4;
  const teamName = (team: number) => room?.players.filter((p, i) => p && i % 2 === team).map(p => p!.name).join(' و ');

  let status = 'منتظر دوستان';
  if (room?.paused) status = 'بازی متوقف است · منتظر اتصال دوباره';
  else if (room?.phase === 'trump') status = me === room.hakem ? 'حکم را انتخاب کنید' : `${room.players[room.hakem]?.name} حکم را انتخاب می‌کند`;
  else if (room?.phase === 'playing') status = myTurn ? 'نوبت شماست' : `نوبت ${room.players[room.turn]?.name}`;
  else if (room?.phase === 'trickEnd') status = `${room.players[room.lastTrickWinner ?? 0]?.name} این دور را برد`;
  else if (room?.phase === 'handEnd') status = 'این دست تمام شد';
  else if (room?.phase === 'matchEnd') status = 'بازی تمام شد';

  function swap(seat: number) {
    if (swapFrom === null) setSwapFrom(seat);
    else { socket.emit('swap', { from: swapFrom, to: seat }); setSwapFrom(null); }
  }

  return <main className="app" dir="rtl">
    <header className="header"><div><span className="eyebrow">دور هم، یک دست</span><h1>حکم<span className="brand-suit">♠</span></h1></div>
      <button className="icon-button" aria-label="راهنمای بازی" onClick={() => setHelp(!help)}>؟</button></header>
    {!online && <div className="connection" role="status">در حال اتصال به میز…</div>}
    {error && <div className="error" role="alert"><span>{error}</span><button aria-label="بستن پیام" onClick={() => setError('')}>×</button></div>}
    {help && <aside className="help"><b>چهار نفر، دو تیم</b><p>بازیکنان روبه‌رو هم‌تیمی‌اند. بازی پادساعتگرد است. اگر خال شروع‌شده را دارید، باید همان خال را بازی کنید. بالاترین حکم، یا بالاترین کارت خال شروع‌شده، برنده است.</p><p>۷ دور برای برد دست؛ ۷ امتیاز برای برد بازی. کوت: ۲ امتیاز؛ حاکم‌کوت: ۳ امتیاز.</p><p>هر چهار نفر آدرس همین صفحه را در یک شبکه محلی باز کنند. برای برگشت به صندلی خود، از همین مرورگر استفاده کنید.</p></aside>}

    {me < 0 ? <section className="join-panel">
      <div className="suit-art" aria-hidden="true">♠ <span>♥</span> ♣ <span>♦</span></div>
      <h2>یک میز، چهار رفیق</h2><p>اسمت را بنویس و بیا پای بازی.</p>
      <form onSubmit={event => { event.preventDefault(); join(name); }}>
        <label htmlFor="name">نام شما</label><input id="name" value={name} maxLength={24} autoComplete="nickname" placeholder="مثلاً سارا" onChange={event => setName(event.target.value)} required />
        <button className="primary" disabled={!online || joining || !name.trim()}>{joining ? 'در حال ورود…' : 'ورود به میز'}</button>
      </form><span className="muted">{fa(room?.players.filter(Boolean).length ?? 0)} از ۴ صندلی پر شده</span>
    </section> : <>
      {lobby ? <section className="lobby">
        <div className="section-title"><h2>میز دوستان</h2><span className="badge">{fa(room!.players.filter(Boolean).length)} / ۴ نفر</span></div>
        <p className="muted">{manager ? 'شما مدیر هستید. صندلی‌های روبه‌رو یک تیم‌اند.' : 'مدیر میز بازیکنان را می‌چیند و بازی را شروع می‌کند.'}</p>
        <div className="seats">{room!.players.map((player, seat) => <div key={seat} className={`lobby-seat team-${seat % 2} ${swapFrom === seat ? 'selected' : ''}`}>
          <div className="seat-meta">صندلی {fa(seat + 1)} <span>تیم {fa(seat % 2 + 1)}</span></div>
          <strong>{player?.name ?? 'صندلی خالی'}</strong>
          <small>{player ? `${player.id === room!.you ? 'شما · ' : ''}${player.id === room!.managerId ? 'مدیر · ' : ''}${player.connected ? 'متصل' : 'قطع شده'}` : 'منتظر بازیکن'}</small>
          {manager && <button className="text-button" disabled={!online} onClick={() => swap(seat)}>{swapFrom === seat ? 'لغو انتخاب' : swapFrom !== null ? 'جابجایی با این صندلی' : 'جابجایی'}</button>}
          {manager && player && !player.connected && <button className="text-button danger" onClick={() => socket.emit('remove', seat)}>حذف بازیکن</button>}
        </div>)}</div>
        {manager ? <button className="primary" disabled={!ready || !online} onClick={() => socket.emit('start')}>شروع بازی</button> : <p className="waiting">منتظر شروع بازی توسط مدیر</p>}
        {!ready && <p className="muted center">برای شروع، هر چهار نفر باید متصل باشند.</p>}
        <button className="text-button leave" disabled={!online} onClick={() => { localStorage.removeItem('hokm-name'); socket.emit('leave'); }}>خروج از میز</button>
      </section> : <>
        <section className="scoreboard" aria-label="امتیاز بازی">{[me % 2, 1 - me % 2].map((team, i) => <div key={team}><span>{i === 0 ? 'تیم شما' : 'تیم مقابل'}</span><strong>{fa(room!.scores[team])}<small> / ۷</small></strong><span className="trick-count">{fa(room!.tricks[team])} دور این دست</span></div>)}
          <div className="trump-label">{room!.trump ? <><span className={red(room!.trump) ? 'red' : ''}>{symbols[room!.trump]}</span><small>حکم</small></> : <><span>؟</span><small>حکم</small></>}</div>
        </section>
        <section className="table" aria-label="میز بازی">
          {room!.players.map((player, seat) => <div key={seat} className={`player position-${relative(seat)} ${room!.turn === seat && room!.phase === 'playing' ? 'current' : ''} ${!player?.connected ? 'offline' : ''}`}>
            <span className={`avatar team-${seat % 2}`}>{seat === room!.hakem ? <span role="img" aria-label="حاکم" title="حاکم">👑</span> : player?.name.slice(0, 1)}</span><strong>{player?.name}{seat === me ? ' (شما)' : ''}</strong>
            <small>{!player?.connected ? 'قطع شده' : `${seat === room!.hakem ? 'حاکم · ' : ''}${fa(room!.handCounts[seat])} کارت`}</small>
          </div>)}
          <div className="table-center"><span className="table-mark" aria-hidden="true">♠</span>{room!.trick.map(play => <div key={play.seat} className={`played played-${relative(play.seat)}`}><CardFace card={play.card} /></div>)}</div>
        </section>
        <div className={`status ${myTurn ? 'your-turn' : ''}`} role="status">{status}</div>
        {room!.phase === 'trump' && room!.hakem === me && <div className="trump-picker" aria-label="انتخاب حکم">{suits.map(suit => <button key={suit} disabled={room!.paused || !online} onClick={() => socket.emit('trump', suit)}><span className={red(suit) ? 'red' : ''}>{symbols[suit]}</span>{suitNames[suit]}</button>)}</div>}
        {(room!.phase === 'handEnd' || room!.phase === 'matchEnd') && <div className="result"><strong>{teamName(room!.winner!)} {room!.phase === 'matchEnd' ? 'برنده بازی شدند!' : 'این دست را بردند'}</strong>
          {manager && room!.phase === 'handEnd' && <button className="primary" disabled={room!.paused || !online} onClick={() => socket.emit('next')}>دست بعدی</button>}
          {manager && room!.phase === 'matchEnd' && <button className="primary" disabled={!online} onClick={() => socket.emit('reset')}>بازگشت به میز</button>}
        </div>}
        <section className="hand" aria-label="کارت‌های شما" dir="ltr">{hand.map(card => {
          const legal = myTurn && (!mustFollow || card.suit === led) && !pending;
          return <button key={card.id} className={`hand-card ${legal ? 'playable' : ''}`} disabled={!legal} aria-label={`${rank(card.rank)} ${suitNames[card.suit]}`} onClick={() => { setPending(card.id); socket.emit('play', card.id); }}><CardFace card={card} /></button>;
        })}</section>
        <footer className="game-footer"><span>تیم شما: {teamName(me % 2)}</span>{manager && <button className="text-button" disabled={!online} onClick={() => { if (window.confirm('بازی و امتیازها پاک شوند و به میز برگردیم؟')) socket.emit('reset'); }}>بازنشانی بازی</button>}</footer>
      </>}
    </>}
    {!active && <footer className="page-footer">بدون شلوغی. فقط حکم.</footer>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
