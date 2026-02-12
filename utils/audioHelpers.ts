
export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      resolve(base64String.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Tạo âm thanh phản hồi UI tùy chỉnh với âm lượng điều chỉnh được
 */
export function playUISound(
  type: 'click' | 'success', 
  profile: 'default' | 'crystal' | 'electronic' = 'default',
  volume: number = 0.5
) {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  // Áp dụng mức âm lượng tổng thể từ cấu hình người dùng
  const baseGain = volume * 0.2; // Giới hạn âm lượng tối đa để không gây chói tai

  if (type === 'click') {
    if (profile === 'crystal') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.05);
      gain.gain.setValueAtTime(baseGain * 0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    } else if (profile === 'electronic') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.08);
      gain.gain.setValueAtTime(baseGain * 0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
      gain.gain.setValueAtTime(baseGain, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    }
    osc.start(now);
    osc.stop(now + 0.15);
  } else if (type === 'success') {
    if (profile === 'crystal') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(1600, now + 0.2);
      gain.gain.setValueAtTime(baseGain * 0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    } else if (profile === 'electronic') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.3);
      gain.gain.setValueAtTime(baseGain * 0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(500, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
      gain.gain.setValueAtTime(baseGain, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    }
    osc.start(now);
    osc.stop(now + 0.5);
  }
}
