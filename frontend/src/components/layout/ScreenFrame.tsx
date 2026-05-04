const FRAME_CSS = `
  :root {
    --mwz-screen-frame-top-corner-width: clamp(30px, 4.7vw, 48px);
    --mwz-screen-frame-top-corner-height: clamp(30px, 4.8vw, 45px);
    --mwz-screen-frame-top-edge-height: clamp(14px, 1.25vw, 20px);
    --mwz-screen-frame-opacity: 0.96;
  }

  .mwz-app-shell::before,
  .mwz-app-shell::after {
    display: none !important;
  }

  .mwz-screen-frame {
    position: fixed;
    inset: 0;
    z-index: 85;
    pointer-events: none;
    opacity: var(--mwz-screen-frame-opacity);
  }

  .mwz-screen-frame__part {
    position: absolute;
    pointer-events: none;
    background-repeat: no-repeat;
  }

  .mwz-screen-frame__top-left,
  .mwz-screen-frame__top-right {
    top: 0;
    width: var(--mwz-screen-frame-top-corner-width);
    height: var(--mwz-screen-frame-top-corner-height);
    z-index: 4;
    background-size: 100% 100%;
    background-repeat: no-repeat;
  }

  .mwz-screen-frame__top-left {
    left: 0;
    background-image: url('/assets/frame/frame_top_left.png');
    background-position: top left;
  }

  .mwz-screen-frame__top-right {
    right: 0;
    background-image: url('/assets/frame/frame_top_right.png');
    background-position: top right;
  }

  .mwz-screen-frame__top-edge {
    top: 0;
    left: var(--mwz-screen-frame-top-corner-width);
    right: var(--mwz-screen-frame-top-corner-width);
    height: var(--mwz-screen-frame-top-edge-height);
    z-index: 3;
    background-image: url('/assets/frame/frame_top_edge.png');
    background-size: auto 100%;
    background-repeat: repeat-x;
    background-position: top center;
  }

  @media (max-width: 900px) {
    :root {
      --mwz-screen-frame-top-corner-width: clamp(42px, 10vw, 64px);
      --mwz-screen-frame-top-corner-height: clamp(44px, 10.2vw, 66px);
      --mwz-screen-frame-top-edge-height: clamp(10px, 3vw, 16px);
      --mwz-screen-frame-opacity: 0.82;
    }
  }

  @media (max-width: 520px) {
    .mwz-screen-frame {
      opacity: 0.58;
    }
  }
`;

export function ScreenFrame() {
  return (
    <>
      <style>{FRAME_CSS}</style>
      <div className="mwz-screen-frame" aria-hidden="true">
        <div className="mwz-screen-frame__part mwz-screen-frame__top-left" />
        <div className="mwz-screen-frame__part mwz-screen-frame__top-edge" />
        <div className="mwz-screen-frame__part mwz-screen-frame__top-right" />
      </div>
    </>
  );
}
