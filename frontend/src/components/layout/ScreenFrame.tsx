const FRAME_CSS = `
  :root {
    --mwz-screen-frame-top-corner-width: clamp(28px, 4.7vw, 38px);
    --mwz-screen-frame-top-corner-height: clamp(28px, 4.8vw, 34px);
    --mwz-screen-frame-top-edge-height: clamp(14px, 1.25vw, 14px);

    --mwz-screen-frame-bottom-corner-width: var(--mwz-screen-frame-top-corner-width);
    --mwz-screen-frame-bottom-corner-height: var(--mwz-screen-frame-top-corner-height);
    --mwz-screen-frame-bottom-edge-height: var(--mwz-screen-frame-top-edge-height);

    --mwz-screen-frame-side-width: clamp(8px, 1.15vw, 12px);
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
  .mwz-screen-frame__top-right,
  .mwz-screen-frame__bottom-left,
  .mwz-screen-frame__bottom-right {
    z-index: 4;
    background-size: 100% 100%;
    background-repeat: no-repeat;
  }

  .mwz-screen-frame__top-left,
  .mwz-screen-frame__top-right {
    top: 0;
    width: var(--mwz-screen-frame-top-corner-width);
    height: var(--mwz-screen-frame-top-corner-height);
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

  .mwz-screen-frame__left-edge,
  .mwz-screen-frame__right-edge {
    top: var(--mwz-screen-frame-top-corner-height);
    bottom: var(--mwz-screen-frame-bottom-corner-height);
    width: var(--mwz-screen-frame-side-width);
    z-index: 2;
    background-size: 100% auto;
    background-repeat: repeat-y;
  }

  .mwz-screen-frame__left-edge {
    left: 0;
    background-image: url('/assets/frame/frame_left_edge.png');
    background-position: top left;
  }

  .mwz-screen-frame__right-edge {
    right: 0;
    background-image: url('/assets/frame/frame_right_edge.png');
    background-position: top right;
  }

  .mwz-screen-frame__bottom-left,
  .mwz-screen-frame__bottom-right {
    bottom: 0;
    width: var(--mwz-screen-frame-bottom-corner-width);
    height: var(--mwz-screen-frame-bottom-corner-height);
  }

  .mwz-screen-frame__bottom-left {
    left: 0;
    background-image: url('/assets/frame/frame_bottom_left.png');
    background-position: bottom left;
  }

  .mwz-screen-frame__bottom-right {
    right: 0;
    background-image: url('/assets/frame/frame_bottom_right.png');
    background-position: bottom right;
  }

  .mwz-screen-frame__bottom-edge {
    bottom: 0;
    left: var(--mwz-screen-frame-bottom-corner-width);
    right: var(--mwz-screen-frame-bottom-corner-width);
    height: var(--mwz-screen-frame-bottom-edge-height);
    z-index: 3;
    background-image: url('/assets/frame/frame_bottom_edge.png');
    background-size: auto 100%;
    background-repeat: repeat-x;
    background-position: bottom center;
  }

  @media (max-width: 900px) {
    :root {
      --mwz-screen-frame-top-corner-width: clamp(24px, 7vw, 38px);
      --mwz-screen-frame-top-corner-height: clamp(24px, 7vw, 36px);
      --mwz-screen-frame-top-edge-height: clamp(10px, 3vw, 14px);
      --mwz-screen-frame-side-width: clamp(7px, 2.2vw, 12px);
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
        <div className="mwz-screen-frame__part mwz-screen-frame__left-edge" />
        <div className="mwz-screen-frame__part mwz-screen-frame__right-edge" />
        <div className="mwz-screen-frame__part mwz-screen-frame__bottom-left" />
        <div className="mwz-screen-frame__part mwz-screen-frame__bottom-edge" />
        <div className="mwz-screen-frame__part mwz-screen-frame__bottom-right" />
      </div>
    </>
  );
}
