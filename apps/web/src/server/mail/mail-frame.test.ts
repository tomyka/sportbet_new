import { describe, expect, it } from 'vitest';
import { escapeHtml, mailFrame } from './mail-frame';

describe('mailFrame', () => {
  it("wraps the body lines in sportbet's header and card, in order", () => {
    const html = mailFrame(['<p>one</p>', '<p>two</p>']);
    expect(html.startsWith('<!DOCTYPE html>\n<html lang="lt">')).toBe(true);
    expect(html).toContain('>SportBet</span>');
    expect(html).toContain(
      '<div style="padding:28px 24px">\n<p>one</p>\n<p>two</p>\n</div>\n</div>\n</body>\n</html>',
    );
  });
});

describe('escapeHtml', () => {
  it('escapes the five characters that open a tag or leave an attribute', () => {
    expect(escapeHtml(`<b onclick="x">Zalgiris & 'Real'</b>`)).toBe(
      '&lt;b onclick=&quot;x&quot;&gt;Zalgiris &amp; &#39;Real&#39;&lt;/b&gt;',
    );
  });

  it('leaves other text, Lithuanian letters included, as it is', () => {
    expect(escapeHtml('Žalgiris Kaunas')).toBe('Žalgiris Kaunas');
  });
});
