import React, { useEffect, useRef, useState } from "react";

type Props = {
  /** ตัวอย่าง: ws://192.168.1.50:8000 */
  signalingUrl: string;
};

const WebRTCPlayer: React.FC<Props> = ({ signalingUrl }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    const ws = new WebSocket(signalingUrl);
    wsRef.current = ws;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
    });
    pcRef.current = pc;

    // เรา "รับวิดีโอ" อย่างเดียว
    pc.addTransceiver("video", { direction: "recvonly" });

    pc.ontrack = (ev) => {
      const [stream] = ev.streams;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "ice",
            candidate: ev.candidate.candidate,
            sdpMid: ev.candidate.sdpMid,
            sdpMLineIndex: ev.candidate.sdpMLineIndex,
          })
        );
      }
    };

    ws.onopen = async () => {
      setStatus("signaling");
      // เราเป็น offerer
      const offer = await pc.createOffer({
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);

      ws.send(JSON.stringify({ type: "offer", sdp: offer.sdp }));
    };

    ws.onmessage = async (ev) => {
      const data = JSON.parse(ev.data);
      if (data.type === "answer") {
        await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
        setStatus("playing");
      } else if (data.type === "ice") {
        // (ในดีไซน์ข้างบน RPi5 ก็ส่ง ice มาแบบนี้เช่นกัน)
        const candidate = new RTCIceCandidate({
          candidate: data.candidate,
          sdpMid: data.sdpMid,
          sdpMLineIndex: data.sdpMLineIndex,
        });
        await pc.addIceCandidate(candidate);
      }
    };

    ws.onerror = () => setStatus("error");
    ws.onclose = () => setStatus("closed");

    return () => {
      ws.close();
      pc.getSenders().forEach((s) => s.track?.stop());
      pc.close();
    };
  }, [signalingUrl]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: "100%", height: "auto", background: "#000", borderRadius: 12 }}
      />
      <small style={{ opacity: 0.7 }}>Status: {status}</small>
    </div>
  );
};

export default WebRTCPlayer;

/* Add on App.tsx to test
import React from "react";
import WebRTCPlayer from "./components/WebRTCPlayer";

export default function App() {
  // เปลี่ยนเป็น IP ของ RPi5 ใน LAN
  const signalingUrl = "ws://192.168.1.50:8000";
  return (
    <div style={{ padding: 16 }}>
      <h1>RPi5 Real-Time Stream (WebRTC)</h1>
      <WebRTCPlayer signalingUrl={signalingUrl} />
    </div>
  );
}
*/