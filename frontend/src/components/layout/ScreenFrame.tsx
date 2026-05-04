const FRAME_CSS = `
  :root {
    --mwz-screen-frame-top-height: clamp(10px, 2.2vw, 20px);
    --mwz-screen-frame-bottom-height: clamp(48px, 2.2vw, 20px);
    --mwz-screen-frame-side-width: clamp(12px, 1.15vw, 26px);
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

  .mwz-screen-frame__top {
    top: 0;
    left: 0;
    right: 0;
    height: var(--mwz-screen-frame-top-height);
    z-index: 3;
    background-image: url('/assets/frame/frontendborder_top.png');
    background-size: 100% 100%;
    background-position: top center;
  }

  .mwz-screen-frame__bottom {
    bottom: 0;
    left: 0;
    right: 0;
    height: var(--mwz-screen-frame-bottom-height);
    z-index: 3;
    background-image: url('/assets/frame/frontendborder_bottom.png');
    background-size: 100% 100%;
    background-position: bottom center;
  }

  .mwz-screen-frame__left,
  .mwz-screen-frame__right {
    top: var(--mwz-screen-frame-top-height);
    bottom: var(--mwz-screen-frame-bottom-height);
    width: var(--mwz-screen-frame-side-width);
    z-index: 2;
    background-size: 100% auto;
    background-repeat: repeat-y;
  }

  .mwz-screen-frame__left {
    left: 0;
    background-image: url('/assets/frame/frontendborder_left.png');
    background-position: top left;
  }

  .mwz-screen-frame__right {
    right: 0;
    background-image: url('/assets/frame/frontendborder_right.png');
    background-position: top right;
  }

  @media (max-width: 900px) {
    :root {
      --mwz-screen-frame-top-height: clamp(32px, 7vw, 58px);
      --mwz-screen-frame-bottom-height: clamp(36px, 8vw, 66px);
      --mwz-screen-frame-side-width: clamp(8px, 2.4vw, 16px);
      --mwz-screen-frame-opacity: 0.82;
    }
  }

  @media (max-width: 520px) {
    .mwz-screen-frame {
      opacity: 0.56;
    }
  }
`;

export function ScreenFrame() {
  return (
    <>
      <style>{FRAME_CSS}</style>
      <div className="mwz-screen-frame" aria-hidden="true">
        <div className="mwz-screen-frame__part mwz-screen-frame__top" />
        <div className="mwz-screen-frame__part mwz-screen-frame__left" />
        <div className="mwz-screen-frame__part mwz-screen-frame__right" />
        <div className="mwz-screen-frame__part mwz-screen-frame__bottom" />
      </div>
    </>
  );
}
