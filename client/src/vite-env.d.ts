/// <reference types="vite/client" />

// ?url 접미사 에셋 임포트(pdfjs worker 등)
declare module "*?url" {
  const src: string;
  export default src;
}
