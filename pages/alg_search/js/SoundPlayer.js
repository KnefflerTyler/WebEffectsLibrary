'use strict';

export class SoundPlayer {
    constructor() {
        this.audioContext = null;
        this.master = null;
        this.compressor = null;
        this.reverbSend = null;
        this.reverb = null;
        this.reverbGain = null;
        this.noiseBuffer = null;
        this.reverbImpulse = null;
        this.lastAcceptedNoteTime = 0;
        this.minTriggerInterval = 0.003;
        this.enabled = true;
    }

    async playHeight(value, minValue, maxValue, options = {}) {
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
        const frequency = 150 + normalized * 760;
        const baseGain = 0.018 + normalized * 0.026;
        const now = context.currentTime;
        const stepDelayMs = Number(options.stepDelayMs) || 16;
        const fastMode = stepDelayMs <= 7;
        if (now - this.lastAcceptedNoteTime < this.minTriggerInterval) return;

        this._ensureOutputChain(context);
        this.lastAcceptedNoteTime = now;

        if (fastMode) {
            this._triggerPartial(context, {
                now,
                frequency,
                gain: baseGain * 0.85,
                decay: 0.19,
                wave: 'sine',
                detuneStart: 6,
                reverbAmount: 0.06,
            });

            this._triggerPartial(context, {
                now,
                frequency: frequency * 2.75,
                gain: baseGain * 0.13,
                decay: 0.12,
                wave: 'sine',
                detuneStart: 2,
                reverbAmount: 0.03,
            });
            return;
        }

        this._triggerPartial(context, {
            now,
            frequency,
            gain: baseGain,
            decay: 0.42,
            wave: 'sine',
            detuneStart: 10,
            reverbAmount: 1,
        });

        this._triggerPartial(context, {
            now,
            frequency: frequency * 2.86,
            gain: baseGain * 0.23,
            decay: 0.25,
            wave: 'sine',
            detuneStart: 6,
            reverbAmount: 0.65,
        });

        this._triggerPartial(context, {
            now,
            frequency: frequency * 6.12,
            gain: baseGain * 0.05,
            decay: 0.16,
            wave: 'sine',
            detuneStart: 3,
            reverbAmount: 0.5,
        });

        this._triggerMalletNoise(context, now, frequency, baseGain * 0.22, 0.7);
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

    _ensureOutputChain(context) {
        if (this.master && this.compressor && this.reverbSend && this.reverb && this.reverbGain) return;

        this.compressor = context.createDynamicsCompressor();
        this.compressor.threshold.value = -26;
        this.compressor.knee.value = 16;
        this.compressor.ratio.value = 5;
        this.compressor.attack.value = 0.001;
        this.compressor.release.value = 0.09;

        this.master = context.createGain();
        this.master.gain.value = 0.9;

        this.reverbSend = context.createGain();
        this.reverbSend.gain.value = 0.11;

        this.reverbGain = context.createGain();
        this.reverbGain.gain.value = 0.16;

        this.reverb = context.createConvolver();
        if (!this.reverbImpulse) {
            this.reverbImpulse = this._createImpulseResponse(context, 0.42, 3.6);
        }
        this.reverb.buffer = this.reverbImpulse;

        this.reverbSend.connect(this.reverb);
        this.reverb.connect(this.reverbGain);
        this.reverbGain.connect(this.compressor);
        this.compressor.connect(this.master);
        this.master.connect(context.destination);
    }

    _triggerPartial(context, params) {
        const {
            now,
            frequency,
            gain,
            decay,
            wave,
            detuneStart,
            reverbAmount = 1,
        } = params;

        const oscillator = context.createOscillator();
        const partialGain = context.createGain();
        const toneFilter = context.createBiquadFilter();

        oscillator.type = wave;
        oscillator.frequency.setValueAtTime(frequency, now);
        oscillator.detune.setValueAtTime(detuneStart, now);
        oscillator.detune.exponentialRampToValueAtTime(0.01, now + 0.025);

        toneFilter.type = 'lowpass';
        toneFilter.frequency.setValueAtTime(Math.min(4200, frequency * 3.1), now);
        toneFilter.Q.value = 0.55;

        partialGain.gain.setValueAtTime(0.0001, now);
        partialGain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + 0.0045);
        partialGain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

        oscillator.connect(toneFilter);
        toneFilter.connect(partialGain);
        partialGain.connect(this.compressor);
        if (reverbAmount > 0) {
            const sendGain = context.createGain();
            sendGain.gain.value = reverbAmount;
            partialGain.connect(sendGain);
            sendGain.connect(this.reverbSend);
            oscillator.onended = () => {
                oscillator.disconnect();
                toneFilter.disconnect();
                partialGain.disconnect();
                sendGain.disconnect();
            };
        } else {
            oscillator.onended = () => {
                oscillator.disconnect();
                toneFilter.disconnect();
                partialGain.disconnect();
            };
        }

        oscillator.start(now);
        oscillator.stop(now + decay + 0.02);
    }

    _triggerMalletNoise(context, now, frequency, gainValue, reverbAmount = 1) {
        if (!this.noiseBuffer) {
            this.noiseBuffer = this._createNoiseBuffer(context);
        }

        const noise = context.createBufferSource();
        noise.buffer = this.noiseBuffer;

        const bandpass = context.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.setValueAtTime(Math.min(2800, Math.max(900, frequency * 1.45)), now);
        bandpass.Q.value = 1.25;

        const noiseGain = context.createGain();
        noiseGain.gain.setValueAtTime(0.0001, now);
        noiseGain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), now + 0.0018);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.017);

        noise.connect(bandpass);
        bandpass.connect(noiseGain);
        noiseGain.connect(this.compressor);
        let sendGain = null;
        if (reverbAmount > 0) {
            sendGain = context.createGain();
            sendGain.gain.value = reverbAmount;
            noiseGain.connect(sendGain);
            sendGain.connect(this.reverbSend);
        }

        noise.start(now);
        noise.stop(now + 0.024);

        noise.onended = () => {
            noise.disconnect();
            bandpass.disconnect();
            noiseGain.disconnect();
            if (sendGain) sendGain.disconnect();
        };
    }

    _createNoiseBuffer(context) {
        const length = Math.floor(context.sampleRate * 0.01);
        const buffer = context.createBuffer(1, length, context.sampleRate);
        const channel = buffer.getChannelData(0);

        for (let i = 0; i < length; i++) {
            channel[i] = (Math.random() * 2 - 1) * (1 - i / length);
        }

        return buffer;
    }

    _createImpulseResponse(context, durationSeconds, decayPower) {
        const length = Math.floor(context.sampleRate * durationSeconds);
        const impulse = context.createBuffer(2, length, context.sampleRate);

        for (let channelIndex = 0; channelIndex < impulse.numberOfChannels; channelIndex++) {
            const channelData = impulse.getChannelData(channelIndex);
            for (let i = 0; i < length; i++) {
                const t = i / length;
                const envelope = Math.pow(1 - t, decayPower);
                const noise = (Math.random() * 2 - 1) * envelope;
                const previous = i > 0 ? channelData[i - 1] : 0;
                channelData[i] = previous * 0.78 + noise * 0.22;
            }
        }

        return impulse;
    }
}
