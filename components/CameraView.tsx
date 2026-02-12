
import React, { useEffect, useRef, useState, useCallback } from 'react';

interface CameraViewProps {
  onFrame?: (base64: string) => void;
  onError?: (error: string) => void;
  isActive: boolean;
  showPreview: boolean;
  esp32Ip?: string;
}

const CameraView: React.FC<CameraViewProps> = ({ onFrame, onError, isActive, showPreview, esp32Ip }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [isEsp32Mode, setIsEsp32Mode] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  // Sử dụng Ref cho onError để tránh startCamera bị thay đổi dependency khi cha re-render
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Effect to handle ESP32/IP Camera Mode toggle
  useEffect(() => {
    // Kích hoạt chế độ IP Camera nếu có input dài hơn 7 ký tự
    setIsEsp32Mode(!!esp32Ip && esp32Ip.length > 7);
  }, [esp32Ip]);

  // Function to initialize Local Webcam
  const startCamera = useCallback(async () => {
    if (esp32Ip && esp32Ip.length > 7) return;

    try {
      // Stop existing stream if any
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } 
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Ensure video plays with error handling
        try {
            await videoRef.current.play();
        } catch (e: any) { 
            // Bỏ qua lỗi AbortError do việc ngắt quãng play() bởi load() mới
            if (e.name !== 'AbortError') {
                console.error("Video play error", e); 
            }
        }
      }
      setPermissionDenied(false);

    } catch (err: any) {
      console.error("Camera access error:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionDenied(true);
      } else {
        if (onErrorRef.current) onErrorRef.current("Không thể truy cập Webcam (Thiết bị không tìm thấy hoặc bị chiếm dụng).");
      }
    }
  }, [esp32Ip]); // Bỏ onError ra khỏi dependency để tránh restart camera khi status thay đổi

  // Start camera on mount or mode change
  useEffect(() => {
    if (!isEsp32Mode) {
      startCamera();
    }
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    };
  }, [isEsp32Mode, startCamera]);

  // IP Camera / ESP32 Frame Fetching Logic
  useEffect(() => {
    if (!isEsp32Mode || !isActive || !esp32Ip) return;

    const interval = window.setInterval(async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500); // Tăng timeout lên chút cho camera IP chậm
        
        // XỬ LÝ URL LINH HOẠT:
        // 1. Nếu người dùng nhập URL đầy đủ (bắt đầu bằng http), dùng nguyên văn.
        // 2. Nếu chỉ nhập IP, tự động thêm format chuẩn của ESP32 code (/capture).
        let fetchUrl = esp32Ip;
        if (!fetchUrl.startsWith('http')) {
            fetchUrl = `http://${fetchUrl}/capture`;
        }

        // Thêm timestamp để tránh cache trình duyệt
        const separator = fetchUrl.includes('?') ? '&' : '?';
        fetchUrl = `${fetchUrl}${separator}t=${Date.now()}`;
        
        const response = await fetch(fetchUrl, {
          signal: controller.signal,
          // mode: 'cors' // Mặc định là cors, nếu camera IP không hỗ trợ CORS sẽ lỗi tại đây
        }).catch(() => null);
        
        clearTimeout(timeoutId);

        if (response && response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          
          const img = new Image();
          // Quan trọng: Set crossOrigin để vẽ lên canvas mà không bị "tainted"
          img.crossOrigin = "Anonymous"; 
          
          img.onload = () => {
            if (canvasRef.current) {
              const ctx = canvasRef.current.getContext('2d');
              if (ctx) {
                canvasRef.current.width = 320;
                canvasRef.current.height = 240;
                ctx.drawImage(img, 0, 0, 320, 240);
                
                if (onFrame) {
                  try {
                    const base64 = canvasRef.current.toDataURL('image/jpeg', 0.6).split(',')[1];
                    onFrame(base64);
                  } catch (e) {
                    console.warn("CORS Error: Không thể lấy dữ liệu ảnh từ Camera IP này do chặn bảo mật.");
                    if (onErrorRef.current) onErrorRef.current("Lỗi CORS: Camera IP chặn truy cập từ Web. Hãy cấu hình Camera cho phép Cross-Origin.");
                  }
                }
              }
            }
            URL.revokeObjectURL(url);
          };
          img.onerror = () => {
             console.warn("Image load error");
             URL.revokeObjectURL(url);
          }
          img.src = url;
          
          if (imgRef.current) imgRef.current.src = url;
        }
      } catch (e) {
        // Silent fail 
      }
    }, 1000); // 1 FPS

    return () => clearInterval(interval);
  }, [isActive, esp32Ip, isEsp32Mode, onFrame]);

  // Local Webcam Frame Capture Logic
  useEffect(() => {
    if (isEsp32Mode || permissionDenied) return;

    let interval: number | null = null;
    if (onFrame && isActive) {
      interval = window.setInterval(() => {
        if (canvasRef.current && videoRef.current && isActive && videoRef.current.readyState === 4) {
          const ctx = canvasRef.current.getContext('2d');
          const video = videoRef.current;
          if (ctx && video.videoWidth > 0) {
            canvasRef.current.width = 320; 
            canvasRef.current.height = 240;
            ctx.drawImage(video, 0, 0, 320, 240);
            
            canvasRef.current.toBlob((blob) => {
              if (blob) {
                const reader = new FileReader();
                reader.onloadend = () => {
                  const base64String = (reader.result as string).split(',')[1];
                  onFrame(base64String);
                };
                reader.readAsDataURL(blob);
              }
            }, 'image/jpeg', 0.5);
          }
        }
      }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isActive, onFrame, isEsp32Mode, permissionDenied]);

  return (
    <div className={`fixed bottom-4 left-4 z-[100] w-32 h-24 sm:w-48 sm:h-36 rounded-2xl overflow-hidden border-2 border-white/10 shadow-2xl transition-all duration-500 transform ${isActive && showPreview ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}>
      {isEsp32Mode ? (
        <div className="w-full h-full bg-black relative">
          <img ref={imgRef} className="w-full h-full object-cover grayscale contrast-125" alt="External Camera Stream" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
             {!imgRef.current?.src && <span className="text-[8px] text-slate-500 animate-pulse">CONNECTING CAM...</span>}
          </div>
        </div>
      ) : (
        <>
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover grayscale contrast-125" />
          {permissionDenied && (
             <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center p-2 text-center z-10">
                 <p className="text-[8px] text-red-400 font-bold mb-2 uppercase tracking-wide">Camera Blocked</p>
                 <button 
                     onClick={startCamera} 
                     className="px-3 py-1.5 bg-red-500/20 border border-red-500/50 rounded-lg text-[8px] font-bold text-white hover:bg-red-500/40 transition-colors active:scale-95"
                 >
                     BẬT CAMERA
                 </button>
             </div>
          )}
        </>
      )}
      
      <div className="absolute top-2 right-2 flex gap-1 z-20">
        <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isEsp32Mode ? 'bg-orange-500' : 'bg-red-500'}`}></div>
        <div className="px-1.5 py-0.5 bg-black/50 backdrop-blur-md rounded-md text-[6px] font-black text-white uppercase tracking-tighter">
          {isEsp32Mode ? 'IP CAM' : 'LOCAL CAM'}
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default CameraView;
