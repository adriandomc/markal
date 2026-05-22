import { css } from "lit";

export const iconStyles = css`
  .ph {
    font-family: "Phosphor" !important;
    speak: never;
    font-style: normal;
    font-weight: normal;
    font-variant: normal;
    text-transform: none;
    line-height: 1;
    letter-spacing: 0;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  .ph.ph-calendar-dots::before {
    content: "\\e7b4";
  }

  .ph.ph-caret-left::before {
    content: "\\e138";
  }

  .ph.ph-caret-right::before {
    content: "\\e13a";
  }

  .ph.ph-copy::before {
    content: "\\e1ca";
  }

  .ph.ph-export::before {
    content: "\\eaf0";
  }

  .ph.ph-file-pdf::before {
    content: "\\e702";
  }

  .ph.ph-file-png::before {
    content: "\\eb18";
  }

  .ph.ph-gear-six::before {
    content: "\\e272";
  }

  .ph.ph-info::before {
    content: "\\e2ce";
  }

  .ph.ph-list::before {
    content: "\\e2f0";
  }

  .ph.ph-pencil-simple::before {
    content: "\\e3b4";
  }

  .ph.ph-plus::before {
    content: "\\e3d4";
  }

  .ph.ph-trash::before {
    content: "\\e4a6";
  }

  .ph.ph-x::before {
    content: "\\e4f6";
  }
`;
