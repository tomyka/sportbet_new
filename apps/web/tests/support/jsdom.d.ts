// jsdom ships no types, and the plan adds no dependency (@types/jsdom):
// this declares only what tests/support/browser.ts uses of it.
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string);
    readonly window: { readonly document: Document };
  }
}
