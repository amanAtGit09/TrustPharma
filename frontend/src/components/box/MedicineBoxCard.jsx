import React, { useRef, useEffect, useState } from "react";

const STATE_CONFIG = {
  0: { label: "Manufactured", color: "bg-purple-100 text-purple-800 border-purple-300" },
  1: { label: "In-Transit", color: "bg-blue-100 text-blue-800 border-blue-300" },
  2: { label: "At Pharmacy", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  3: { label: "Dispensed", color: "bg-gray-200 text-gray-800 border-gray-400" },
};

export const MedicineBoxCard = ({
  unitId,
  batchId,
  medicineName,
  plainPin,
  state = 0,
  isDispensed = false,
  nextCustodian = null,
  isHandshakeAccepted = false,
  onVerifyClick,
  onScratchRevealed,
}) => {
  const canvasRef = useRef(null);
  const [isScratched, setIsScratched] = useState(false);
  const [revealedPin, setRevealedPin] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || isScratched) return;

    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#d1d5db");
    gradient.addColorStop(0.5, "#9ca3af");
    gradient.addColorStop(1, "#6b7280");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#374151";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SCRATCH TO REVEAL PIN", width / 2, height / 2);
  }, [isScratched]);

  const handleScratch = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || isScratched) return;

    if (e.buttons !== 1) return;

    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2, false);
    ctx.fill();

    checkScratchPercentage(ctx, canvas.width, canvas.height);
  };

  const checkScratchPercentage = (ctx, width, height) => {
    try {
      const imageData = ctx.getImageData(0, 0, width, height);
      const pixels = imageData.data;
      let transparentPixels = 0;

      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] === 0) transparentPixels++;
      }

      const scratchedRatio = transparentPixels / (pixels.length / 4);
      if (scratchedRatio > 0.45) {
        setIsScratched(true);
        setRevealedPin(true);
        if (onScratchRevealed && plainPin) {
          onScratchRevealed(plainPin);
        }
      }
    } catch {
      // Ignore cross-origin context warnings
    }
  };

  const forceReveal = () => {
    setIsScratched(true);
    setRevealedPin(true);
    if (onScratchRevealed && plainPin) {
      onScratchRevealed(plainPin);
    }
  };

  const truncateAddress = (addr) => {
    if (!addr) return "";
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  const stateInfo = STATE_CONFIG[state] || STATE_CONFIG[0];

  return (
    <div className="w-full max-w-sm bg-white border border-gray-300 rounded-xl shadow-md p-5 hover:shadow-lg transition-all relative flex flex-col justify-between">
      <div>
        {/* Header: Serial & Global Status */}
        <div className="flex justify-between items-start mb-3">
          <div>
            <span className="text-xs font-mono font-semibold text-gray-500 uppercase">Serial No:</span>
            <h3 className="text-base font-extrabold text-gray-900 tracking-tight font-mono">{unitId}</h3>
          </div>
          <span className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold ${stateInfo.color}`}>
            {isDispensed ? "Dispensed / Burned" : stateInfo.label}
          </span>
        </div>

        {/* Medicine Meta */}
        <div className="space-y-1 py-2 border-y border-dashed border-gray-200">
          <div className="text-sm font-semibold text-gray-800">{medicineName || "Medicine Package"}</div>
          <div className="text-xs text-gray-500 font-mono">Batch ID: {batchId || "N/A"}</div>
        </div>

        {/* Immediate Next Custodian Handshake Tracking (Only shown once dispatched) */}
        {nextCustodian && (
          <div className="mt-3 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 font-medium">Forwarded To:</span>
              <span className="font-mono text-gray-800 font-semibold">{truncateAddress(nextCustodian)}</span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-gray-200">
              <span className="text-gray-500 font-medium">Handshake Status:</span>
              {isHandshakeAccepted ? (
                <span className="text-emerald-700 font-bold flex items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
                  Accepted
                </span>
              ) : (
                <span className="text-amber-700 font-bold flex items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 animate-pulse"></span>
                  Awaiting Delivery Sign
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tamper-Evident Scratch Zone */}
      <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-semibold text-gray-700">Tamper-Evident PIN</span>
          {!isScratched && (
            <button
              onClick={forceReveal}
              className="text-[10px] text-indigo-600 hover:text-indigo-800 underline font-medium"
            >
              Instant Scratch
            </button>
          )}
        </div>

        <div className="relative w-full h-12 bg-white border border-gray-300 rounded flex items-center justify-center overflow-hidden select-none">
          <span className="font-mono font-black text-gray-900 text-sm tracking-widest px-2">
            {plainPin || "PIN-REDACTED"}
          </span>

          {!isScratched && (
            <canvas
              ref={canvasRef}
              width={260}
              height={48}
              onMouseMove={handleScratch}
              className="absolute inset-0 w-full h-full cursor-pointer touch-none"
            />
          )}
        </div>
        <p className="text-[11px] text-gray-400 mt-1 text-center">
          {revealedPin ? "PIN Revealed! Keep private until dispensing." : "Click and rub across foil to reveal PIN"}
        </p>
      </div>

      {onVerifyClick && (
        <button
          onClick={() => onVerifyClick(unitId, plainPin)}
          className="mt-4 w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 py-2 rounded-lg text-xs font-semibold transition-all"
        >
          Verify in Consumer Portal →
        </button>
      )}
    </div>
  );
};