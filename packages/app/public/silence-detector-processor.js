/**
 * audioneko: Smart Speed Silence Detector AudioWorkletProcessor
 *
 * Runs on the dedicated high-priority Web Audio render thread.
 * Evaluates RMS energy over a rolling 250ms window.
 * Posts messages to the main thread to dynamically compress dead pauses without pitch distortion.
 */

class SilenceDetectorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // -42 dB threshold corresponds to approx 0.00794 RMS
    this.thresholdRms = 0.00794;
    this.silenceFrames = 0;
    // 250ms at standard 44.1kHz / 48kHz
    this.minSilenceFrames = Math.round(sampleRate * 0.25);
    this.isSilent = false;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || input.length === 0 || !input[0]) {
      return true;
    }

    const channelData = input[0];
    let sumSquares = 0;

    for (let i = 0; i < channelData.length; i++) {
      const sample = channelData[i];
      sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / channelData.length);

    if (rms < this.thresholdRms) {
      this.silenceFrames += channelData.length;
      if (this.silenceFrames >= this.minSilenceFrames && !this.isSilent) {
        this.isSilent = true;
        this.port.postMessage({ type: "silence", isSilent: true });
      }
    } else {
      if (this.isSilent) {
        this.isSilent = false;
        this.port.postMessage({ type: "silence", isSilent: false });
      }
      this.silenceFrames = 0;
    }

    // Pass through audio without modification
    for (let c = 0; c < input.length; c++) {
      if (output[c] && input[c]) {
        output[c].set(input[c]);
      }
    }

    return true;
  }
}

registerProcessor("silence-detector-processor", SilenceDetectorProcessor);
