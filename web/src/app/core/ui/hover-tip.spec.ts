import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HoverTip } from './hover-tip';

@Component({
  imports: [HoverTip],
  template: `<div eliHoverTip class="host"><span class="mark" data-tip="KO&#10;HKD 86.4M · 29 positions">x</span><span class="plain">y</span></div>`,
})
class Host {}

describe('HoverTip', () => {
  it('shows the mark\'s lines at once on hover and hides off a mark', async () => {
    TestBed.configureTestingModule({ imports: [Host], providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    const el: HTMLElement = f.nativeElement;
    const move = (target: Element) => target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }));
    move(el.querySelector('.mark')!);
    const tip = document.querySelector<HTMLElement>('[role=tooltip]')!;
    expect(tip.style.display).toBe('block');
    expect([...tip.children].map((c) => c.textContent)).toEqual(['KO', 'HKD 86.4M · 29 positions']);
    move(el.querySelector('.plain')!);
    expect(tip.style.display).toBe('none');
    f.destroy();
    expect(document.querySelector('[role=tooltip]')).toBeNull();
  });
});
