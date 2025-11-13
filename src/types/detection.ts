/**
 * Types สำหรับข้อมูลการตรวจจับวัตถุ
 */

// วัตถุที่ตรวจพบแต่ละชิ้น
export interface DetectedObjectDetail {
  lat?: number;
  lng?: number;
  speed?: number;
  alt?: number;
  tar_lat?: number;
  tar_lng?: number;
}

export interface DetectedObject {
  obj_id: string;      // e.g. "obj_001"
  type: string;        // e.g. "drone", "person", "car"
  lat: number;         // latitude (decimal degrees)
  lng: number;         // longitude (decimal degrees)
  objective: string;   // mission classification
  size: string;        // "small", "medium", "large"
  speed?: number;      // optional fallback speed in meters per second // legacy telemetry field
  details?: DetectedObjectDetail; // preferred telemetry field
}

// ข้อมูลกล้อง
export interface Camera {
  id: string;          // UUID ของกล้อง
  name: string;        // ชื่อกล้อง เช่น "Team Alpha"
  location: string;    // ตำแหน่งกล้อง "defence" หรือ "offence"

}

// เหตุการณ์การตรวจจับ
export interface DetectionEvent {
  id: number;                    // ID ของ event
  cam_id: string;                // UUID ของกล้อง
  camera: Camera;                // ข้อมูลกล้อง
  timestamp: string;             // เวลาที่ตรวจจับ (ISO 8601)
  image_path: string;            // path รูปภาพ เช่น "/uploads/images/..."
  objects: DetectedObject[];     // รายการวัตถุที่ตรวจจับได้
}

// Response จาก API
export interface DetectionResponse {
  success: boolean;              // สถานะความสำเร็จ
  data: DetectionEvent[];        // รายการ detection events
}

