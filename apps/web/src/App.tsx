import { useEffect, useMemo, useRef, useState } from 'react';
import { PetRoom } from './components/PetRoom';
import { usePetStore } from './store/usePetStore';
import { useTaskEvents } from './hooks/useTaskEvents';

const ROOM = 512;

type GaugeKey = 'satiety' | 'affection' | 'energy';

export function App() {
  const { hunger, affection, energy, statusText, petX, petY, feed, pet, say, tick, tickMove } = usePetStore();
  const currentCategory = usePetStore((s) => s.currentCategory);
  const monologueEnabled = usePetStore((s) => s.monologueEnabled);
  const [activeTip, setActiveTip] = useState<GaugeKey | null>(null);
  const [petName, setPetName] = useState('Claw');
  const [muted, setMuted] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const bgmTimerRef = useRef<number | null>(null);
  const lastStatusRef = useRef('');

  useTaskEvents();

  useEffect(() => {
    fetch('http://localhost:8787/profile')
      .then((r) => r.json())
      .then((d) => {
        if (d?.assistantName) setPetName(d.assistantName);
      })
      .catch(() => { });

    // 혼잣말 상태 동기화
    fetch('http://localhost:8787/monologue/status')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d?.enabled === 'boolean') {
          usePetStore.setState({ monologueEnabled: d.enabled });
        }
      })
      .catch(() => { });

    return () => { };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      setChatOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const id = setInterval(() => tick(), 60000);
    return () => clearInterval(id);
  }, [tick]);

  useEffect(() => {
    const id = setInterval(() => tickMove(), 50);
    return () => clearInterval(id);
  }, [tickMove]);

  const satiety = Math.max(0, Math.min(100, Math.round(100 - hunger)));
  const love = Math.max(0, Math.min(100, Math.round(affection)));
  const power = Math.max(0, Math.min(100, Math.round(energy)));

  const bubble = useMemo(() => statusText || '', [statusText]);

  const tipText: Record<GaugeKey, string> = {
    satiety: `포만감 ${satiety}%`,
    affection: `애정도 ${love}%`,
    energy: `에너지 ${power}%`
  };

  const onTouchGauge = (key: GaugeKey) => setActiveTip(key);

  const ensureAudio = () => {
    if (audioCtxRef.current) return audioCtxRef.current;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    audioCtxRef.current = new Ctx();
    return audioCtxRef.current;
  };

  const playSfx = (kind: 'typing' | 'water' | 'page' | 'walk' | 'feed' | 'petting' | 'sleep' | 'pop') => {
    if (muted) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime;

    if (kind === 'typing') {
      // 타닥타닥
      for (let i = 0; i < 6; i++) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 380 + i * 40;
        g.gain.setValueAtTime(0.0001, t0 + i * 0.05);
        g.gain.exponentialRampToValueAtTime(0.03, t0 + i * 0.05 + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.05 + 0.04);
        osc.connect(g).connect(ctx.destination);
        osc.start(t0 + i * 0.05);
        osc.stop(t0 + i * 0.05 + 0.045);
      }
    }

    if (kind === 'water') {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.value = 0.06;
      src.buffer = buffer;
      src.connect(filter).connect(g).connect(ctx.destination);
      src.start();
    }

    if (kind === 'page') {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, t0);
      osc.frequency.linearRampToValueAtTime(140, t0 + 0.18);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.03, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      osc.connect(g).connect(ctx.destination);
      osc.start();
      osc.stop(t0 + 0.22);
    }

    if (kind === 'walk') {
      // 뽀각 뽀각 (짧은 탭 2개)
      for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 260 + i * 30;
        g.gain.setValueAtTime(0.0001, t0 + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.02, t0 + i * 0.12 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.12 + 0.06);
        osc.connect(g).connect(ctx.destination);
        osc.start(t0 + i * 0.12);
        osc.stop(t0 + i * 0.12 + 0.07);
      }
    }

    if (kind === 'feed') {
      // 냠냠 (부드러운 짧은 음 3개)
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 440 + i * 60;
        g.gain.setValueAtTime(0.0001, t0 + i * 0.14);
        g.gain.exponentialRampToValueAtTime(0.05, t0 + i * 0.14 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.14 + 0.1);
        osc.connect(g).connect(ctx.destination);
        osc.start(t0 + i * 0.14);
        osc.stop(t0 + i * 0.14 + 0.12);
      }
    }

    if (kind === 'petting') {
      // 뽁 (짧고 부드러운 팝)
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, t0);
      osc.frequency.exponentialRampToValueAtTime(200, t0 + 0.15);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
      osc.connect(g).connect(ctx.destination);
      osc.start();
      osc.stop(t0 + 0.16);
    }

    if (kind === 'sleep') {
      // 코오~ (저음 드론)
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, t0);
      osc.frequency.linearRampToValueAtTime(70, t0 + 0.8);
      osc.frequency.linearRampToValueAtTime(90, t0 + 1.6);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.02, t0 + 0.1);
      g.gain.setValueAtTime(0.02, t0 + 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
      osc.connect(g).connect(ctx.destination);
      osc.start();
      osc.stop(t0 + 1.7);
    }

    if (kind === 'pop') {
      // 기본 알림음
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523, t0);
      osc.frequency.linearRampToValueAtTime(660, t0 + 0.08);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.04, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
      osc.connect(g).connect(ctx.destination);
      osc.start();
      osc.stop(t0 + 0.13);
    }
  };

  const playBgmBar = () => {
    if (muted) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const seq = [523.25, 659.25, 783.99, 659.25, 587.33, 659.25, 523.25, 493.88];
    const start = ctx.currentTime;
    seq.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, start + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.018, start + i * 0.18 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.18 + 0.16);
      osc.connect(g).connect(ctx.destination);
      osc.start(start + i * 0.18);
      osc.stop(start + i * 0.18 + 0.17);
    });
  };

  // 이동 중 뽀각 소리 (주기적)
  const walkSfxRef = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      const s = usePetStore.getState();
      const moving = Math.hypot(s.targetX - s.petX, s.targetY - s.petY) > 5;
      if (moving) {
        walkSfxRef.current++;
        if (walkSfxRef.current % 6 === 0) playSfx('walk'); // 매 6틱마다 뽀각
      }
    }, 200);
    return () => clearInterval(id);
  }, [muted]);

  useEffect(() => {
    if (!statusText || statusText === lastStatusRef.current) return;
    lastStatusRef.current = statusText;
    // 상황별 SFX 매칭
    if (statusText.includes('냠냠') || statusText.includes('밥')) playSfx('feed');
    else if (statusText.includes('기분 좋아') || statusText.includes('간지러워') || statusText.includes('더 해줘')) playSfx('petting');
    else if (statusText.includes('침대에서 낮잠')) playSfx('sleep');
    else if (statusText.includes('코딩') || statusText.includes('타닥')) playSfx('typing');
    else if (statusText.includes('칙칙')) playSfx('water');
    else if (statusText.includes('만화책 보는')) playSfx('page');
    else if (statusText.includes('완료')) playSfx('pop');
  }, [statusText, muted]);

  useEffect(() => {
    if (bgmTimerRef.current) {
      window.clearInterval(bgmTimerRef.current);
      bgmTimerRef.current = null;
    }
    if (muted) return;
    playBgmBar();
    bgmTimerRef.current = window.setInterval(() => playBgmBar(), 1600);
    return () => {
      if (bgmTimerRef.current) window.clearInterval(bgmTimerRef.current);
      bgmTimerRef.current = null;
    };
  }, [muted]);

  const sendChat = async () => {
    const text = chatText.trim().slice(0, 100);
    if (!text) return;
    say('생각중이에요...', 65000);
    setChatText('');
    setChatOpen(false);
    try {
      const r = await fetch('http://localhost:8787/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      const d = await r.json();
      say((d?.reply || '네!').slice(0, 100), 4000);
    } catch {
      say('네! 들었어요.', 2000);
    }
  };

  return (
    <main className="appRoot">
      <section className="roomShell" style={{ width: ROOM, height: ROOM }} onClick={() => setActiveTip(null)}>
        <PetRoom />

        <div className="petNameTag" style={{ left: petX, top: Math.max(10, petY - 60) }}>{petName}</div>

        <button className="soundToggle" onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); }} title={muted ? '소리 켜기' : '소리 끄기'}>
          {muted ? '🔇' : '🔊'}
        </button>

        <button
          className="monologueToggle"
          onClick={(e) => {
            e.stopPropagation();
            const nextEnabled = !monologueEnabled;
            fetch('http://localhost:8787/monologue/toggle', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ enabled: nextEnabled })
            }).catch(() => { });
            usePetStore.setState({ monologueEnabled: nextEnabled });
          }}
          title={monologueEnabled ? '혼잣말 끄기' : '혼잣말 켜기'}
        >
          {monologueEnabled ? '🗣️' : '🤐'}
        </button>

        {bubble && (
          <div className={`petBubble${currentCategory ? ' petBubble--task' : ''}`} style={{ left: petX, top: Math.max(18, petY - 38) }}>
            {bubble}
          </div>
        )}

        <div className="hudBars" onClick={(e) => e.stopPropagation()}>
          {([
            ['satiety', '🍙', satiety],
            ['affection', '💗', love],
            ['energy', '🔋', power]
          ] as [GaugeKey, string, number][]).map(([key, emoji, val]) => (
            <button
              key={key}
              className="hudBar"
              onMouseEnter={() => setActiveTip(key)}
              onMouseLeave={() => setActiveTip((prev) => (prev === key ? null : prev))}
              onClick={() => onTouchGauge(key)}
              aria-label={tipText[key]}
            >
              <span className="hudEmoji">{emoji}</span>
              <span className="pixelBar"><span className="pixelFill" style={{ width: `${val}%` }} /></span>
              {activeTip === key && <span className={`gaugeTip ${key === 'satiety' ? 'tipDown' : ''}`}>{tipText[key]}</span>}
            </button>
          ))}
        </div>

        <div className="hudActions" onClick={(e) => e.stopPropagation()}>
          <button className="pixelBtn" onClick={feed} title="밥주기">🍙</button>
          <button className="pixelBtn" onClick={pet} title="쓰다듬기">🤲</button>
          <button className="pixelBtn" onClick={() => setChatOpen((v) => !v)} title="대화하기">/</button>
        </div>

        {chatOpen && (
          <div className="chatBox" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={chatText}
              maxLength={100}
              onChange={(e) => setChatText(e.target.value.slice(0, 100))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendChat();
                if (e.key === 'Escape') setChatOpen(false);
              }}
              placeholder="100자 이내"
            />
            <span>{chatText.length}/100</span>
          </div>
        )}
      </section>
    </main>
  );
}
