declare module 'html-to-docx' {
  function HTMLtoDOCX(
    htmlString: string,
    headerHTMLString: string | null,
    documentOptions?: Record<string, unknown>,
  ): Promise<Buffer | ArrayBuffer | Uint8Array>;

  export = HTMLtoDOCX;
}
