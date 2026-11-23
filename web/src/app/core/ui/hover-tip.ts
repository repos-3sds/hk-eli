import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';

/**
 * Hover information for charts. Put it on a chart's container and give each mark a `data-tip`
 * ("line one\nline two"). The tip follows the pointer, shows at once (unlike a native title), works
 * on SVG and HTML marks, on touch (tap), and inside the web component's Shadow DOM.
 */
@Directive({ selector: '[eliHoverTip]' })
export class HoverTip {
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private tip: HTMLDivElement | null = null;

  constructor() {
    const over = (e: PointerEvent) => this.show(e);
    const leave = () => this.hide();
    this.host.addEventListener('pointermove', over);
    this.host.addEventListener('pointerdown', over);
    this.host.addEventListener('pointerleave', leave);
    inject(DestroyRef).onDestroy(() => {
      this.host.removeEventListener('pointermove', over);
      this.host.removeEventListener('pointerdown', over);
      this.host.removeEventListener('pointerleave', leave);
      this.tip?.remove();
    });
  }

  private show(e: PointerEvent): void {
    const mark = (e.target as Element | null)?.closest?.('[data-tip]');
    const text = mark && this.host.contains(mark) ? mark.getAttribute('data-tip') : null;
    if (!text) {
      this.hide();
      return;
    }
    const tip = this.ensure();
    if (tip.dataset['text'] !== text) {
      tip.dataset['text'] = text;
      tip.replaceChildren(...text.split('\n').map((line, i) => {
        const d = document.createElement('div');
        d.textContent = line;
        if (i === 0) d.style.fontWeight = '600';
        return d;
      }));
    }
    tip.style.display = 'block';
    const pad = 14;
    const { innerWidth: vw, innerHeight: vh } = window;
    const r = tip.getBoundingClientRect();
    const x = e.clientX + pad + r.width > vw ? e.clientX - pad - r.width : e.clientX + pad;
    const y = e.clientY + pad + r.height > vh ? e.clientY - pad - r.height : e.clientY + pad;
    tip.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`;
  }

  private hide(): void {
    if (this.tip) this.tip.style.display = 'none';
  }

  private ensure(): HTMLDivElement {
    if (this.tip) return this.tip;
    const t = document.createElement('div');
    t.setAttribute('role', 'tooltip');
    Object.assign(t.style, {
      position: 'fixed', left: '0', top: '0', zIndex: '1000', display: 'none', pointerEvents: 'none', maxWidth: '320px',
      padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--eli-border, #33405a)',
      background: 'var(--eli-bg-dock, #141b29)', color: 'var(--eli-text-strong, #fff)', boxShadow: '0 6px 18px rgb(0 0 0 / 45%)',
      font: '12px/18px var(--eli-font-family, "Open Sans", sans-serif)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
    } satisfies Partial<CSSStyleDeclaration>);
    const root = this.host.getRootNode();
    (root instanceof ShadowRoot ? root : document.body).appendChild(t);
    return (this.tip = t);
  }
}
