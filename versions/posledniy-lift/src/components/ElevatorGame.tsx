import { useEffect, useRef, useState } from "react";
import { Game, type Scene } from "@/game/game";

export function ElevatorGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [scene, setScene] = useState<Scene>("menu");
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas, setScene);
    gameRef.current = game;
    setMuted(game.muted);
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      game.frame(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onVis = () => game.wake();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      game.destroy();
      gameRef.current = null;
    };
  }, []);

  const ended = scene === "win" || scene === "lose" || scene === "draw";

  return (
    <main className="game-root">
      <canvas ref={canvasRef} aria-label="Последний лифт" />
      <div className="hud">
        <button
          type="button"
          className="mute"
          aria-pressed={muted}
          aria-label={muted ? "Включить звук" : "Выключить звук"}
          onClick={() => {
            const game = gameRef.current;
            if (!game) return;
            setMuted(game.toggleMute());
          }}
        >
          {muted ? "тихо" : "звук"}
        </button>
        {scene === "menu" ? (
          <button type="button" className="plate" onClick={() => gameRef.current?.start()}>
            Начать игру
          </button>
        ) : null}
        {ended ? (
          <button type="button" className="plate" onClick={() => gameRef.current?.replay()}>
            Ещё раз
          </button>
        ) : null}
      </div>
    </main>
  );
}
