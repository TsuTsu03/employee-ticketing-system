'use client';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
export default function Map({
  shifts,
}: {
  shifts: Array<{ start_geo: any; end_geo: any; user_id: string }>;
}) {
  const points: Array<{ lat: number; lng: number; label: string }> = [];
  shifts.forEach((s) => {
    if (s.start_geo?.lat && s.start_geo?.lng)
      points.push({
        lat: s.start_geo.lat,
        lng: s.start_geo.lng,
        label: `${s.user_id.slice(0, 8)} start`,
      });
    if (s.end_geo?.lat && s.end_geo?.lng)
      points.push({
        lat: s.end_geo.lat,
        lng: s.end_geo.lng,
        label: `${s.user_id.slice(0, 8)} end`,
      });
  });
  const center = points[0] ?? { lat: 14.5995, lng: 120.9842, label: 'Center' };
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={12} className="h-full w-full rounded">
      <TileLayer
        attribution="&copy; OpenStreetMap"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((p, i) => (
        <Marker key={i} position={[p.lat, p.lng]}>
          <Popup>{p.label}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
