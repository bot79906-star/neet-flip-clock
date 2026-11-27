// The flip card used by the new tab page and the reminder card.
//
// reveal(): the top half rises into place on a spring (real digits, never placeholders).
// set():    the physical flip. The top half falls with gravity and darkens, the bottom half
//           lands with a tiny rebound and the card gives a hair of a thud. Light follows the angle.
// All of it is transform and opacity, so it runs on the compositor.
(() => {
  'use strict';

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const FALL = 230;   // ms, top half falls
  const LAND = 300;   // ms, bottom half lands

  class FlipCard {
    constructor(parent, initial) {
      this.el = document.createElement('div');
      this.el.className = 'flip';
      this.el.innerHTML =
        '<div class="half upper"><span></span><i class="shade"></i></div>' +
        '<div class="half lower"><span></span><i class="shade"></i></div>' +
        '<div class="flap front"><span></span><i class="shade"></i><i class="gloss"></i></div>' +
        '<div class="flap back"><span></span><i class="shade"></i><i class="gloss"></i></div>';

      const q = (s) => this.el.querySelector(s);
      this.parts = {
        upper: { box: q('.upper'), text: q('.upper span'), shade: q('.upper .shade') },
        lower: { box: q('.lower'), text: q('.lower span'), shade: q('.lower .shade') },
        front: { box: q('.front'), text: q('.front span'), shade: q('.front .shade'), gloss: q('.front .gloss') },
        back:  { box: q('.back'),  text: q('.back span'),  shade: q('.back .shade'), gloss: q('.back .gloss') },
      };
      this.value = initial;
      this.anims = [];
      this.token = 0;
      this.paint(initial);
      parent.appendChild(this.el);
    }

    paint(v) {
      for (const k in this.parts) this.parts[k].text.textContent = v;
    }

    // arrival: the card lifts into place while its top half swings up on a spring
    reveal(delay = 0) {
      if (reduced() || !this.el.isConnected) return;
      const up = this.parts.upper;
      // arrival never overshoots (no card pushed past its place, no flap poking out): p is capped at 1
      Motion.play(this.el, (p) => ({
        opacity: Motion.clamp01(p * 2.4),
        transform: 'translate3d(0,' + ((1 - Math.min(1, p)) * 20).toFixed(2) + 'px,0)',
      }), { stiffness: 190, damping: 25, delay });
      Motion.play(up.box, (p) => ({ transform: 'rotateX(' + (-(1 - Math.min(1, p)) * 88).toFixed(2) + 'deg)' }),
        { stiffness: 150, damping: 24, delay: delay + 40 });
      Motion.play(up.shade, (p) => ({ opacity: Motion.clamp01(0.75 * (1 - p)).toFixed(3) }),
        { stiffness: 150, damping: 22, delay: delay + 40 });
    }

    // end any running flip and leave the card at rest
    stop() {
      this.token++;
      this.anims.forEach((a) => a.cancel());
      this.anims = [];
      this.el.classList.remove('flipping');
    }

    // speed: 1 is the full flip; the seconds use a quicker one so the card is at rest most of every second
    set(next, { animate = true, speed = 1 } = {}) {
      if (next === this.value) return;
      const prev = this.value;
      this.value = next;
      this.stop();

      if (!animate || reduced() || document.hidden || !this.el.isConnected) {
        this.paint(next);
        return;
      }

      const p = this.parts;
      p.upper.text.textContent = next;   // waits underneath
      p.front.text.textContent = prev;   // falls away
      p.back.text.textContent = next;    // lands
      p.lower.text.textContent = prev;
      this.el.classList.add('flipping');

      const fallMs = Math.round(FALL * speed), landMs = Math.round(LAND * speed);
      const run = (el, keyframes, options) => {
        const a = el.animate(keyframes, Object.assign({ fill: 'both' }, options));
        this.anims.push(a);
        return a;
      };

      // 1. the top half falls forward: slow start, gains speed (gravity). It stays inside the card's outline.
      const fall = { duration: fallMs, easing: 'cubic-bezier(0.55, 0, 0.92, 0.6)' };
      run(p.front.box, [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-90deg)' }], fall);
      run(p.front.gloss, [{ opacity: 0 }, { opacity: 0.22, offset: 0.55 }, { opacity: 0 }], fall);
      run(p.front.shade, [{ opacity: 0 }, { opacity: 0.72 }], fall);
      run(p.lower.shade, [{ opacity: 0 }, { opacity: 0.5 }], fall);
      run(p.upper.shade, [{ opacity: 0.38 }, { opacity: 0 }], { duration: fallMs + 40, easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)' });

      // 2. the bottom half swings down and lands flat. It never goes past flat, so it never pokes out of the card.
      const land = { duration: landMs, delay: fallMs, easing: 'cubic-bezier(0.18, 0.8, 0.3, 1)' };
      const last = run(p.back.box, [{ transform: 'rotateX(90deg)' }, { transform: 'rotateX(0deg)' }], land);
      run(p.back.gloss, [{ opacity: 0.3 }, { opacity: 0 }], land);
      run(p.back.shade, [{ opacity: 0.72 }, { opacity: 0 }], land);

      const t = this.token;
      if (self.FlipCard.onLand) setTimeout(() => { if (t === this.token) self.FlipCard.onLand(); }, fallMs + landMs * 0.4);
      last.onfinish = () => {
        if (t !== this.token) return;
        this.paint(next);
        this.stop();
      };
    }
  }

  self.FlipCard = FlipCard;
})();
