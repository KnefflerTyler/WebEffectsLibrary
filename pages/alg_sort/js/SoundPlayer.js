'use strict';

export class SoundPlayer {
    constructor() {
        this.audioContext = null;
        this.enabled = true;
    }

    async playHeight(value, minValue, maxValue) {
        if (!this.enabled) return;
        const context = this._getContext();
        if (!context) return;

        if (context.state === 'suspended') {
            try {
                await context.resume();
            } catch {
                return;
            }
        }

        const normalized = maxValue > minValue
            ? (value - minValue) / (maxValue - minValue)
            : 0.5;
        const frequency = 180 + normalized * 880;
        const gainValue = 0.015 + normalized * 0.035;
        const now = context.currentTime;

        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + 0.09);

        oscillator.onended = () => {
            oscillator.disconnect();
            gain.disconnect();
        };
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
    }

    _getContext() {
        if (this.audioContext) return this.audioContext;
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) return null;
        this.audioContext = new AudioContextCtor();
        return this.audioContext;
    }
}
