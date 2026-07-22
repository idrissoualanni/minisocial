// client/src/components/MeetingControls.jsx

interface MeetingControlsProps {
  onToggleMic: () => void;
  onToggleCam: () => void;
  onHangup: () => void;
  isMuted: boolean;
  isCamOff: boolean;
}

export default function MeetingControls({ onToggleMic, onToggleCam, onHangup, isMuted, isCamOff }: MeetingControlsProps) {
  return (
    <div className="flex items-center justify-center gap-4 p-4 bg-gray-900 rounded-b-xl">
      <button
        onClick={onToggleMic}
        className={`p-3 rounded-full transition text-lg ${isMuted ? "bg-red-500 text-white" : "bg-gray-700 text-white hover:bg-gray-600"}`}
        title={isMuted ? "Activer le micro" : "Couper le micro"}
      >
        {isMuted ? "🔇" : "🎤"}
      </button>
      <button
        onClick={onToggleCam}
        className={`p-3 rounded-full transition text-lg ${isCamOff ? "bg-red-500 text-white" : "bg-gray-700 text-white hover:bg-gray-600"}`}
        title={isCamOff ? "Activer la camera" : "Couper la camera"}
      >
        {isCamOff ? "📷" : "📹"}
      </button>
      <button
        onClick={onHangup}
        className="p-3 rounded-full bg-red-600 text-white hover:bg-red-700 transition text-lg"
        title="Quitter la reunion"
      >
        📞
      </button>
    </div>
  );
}
