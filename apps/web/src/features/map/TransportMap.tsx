import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type {
  ClientConfig,
  ServiceZone,
  VehicleList,
} from "@samokettik/contracts";
import { scooterMarkup } from "../../ui/icons";
import { text, type Locale } from "../../i18n/text";
import "./map.scss";

type Props = {
  fleet: VehicleList;
  zone: ServiceZone;
  config: ClientConfig;
  selectedId: string | null;
  onSelect: (id: string) => void;
  locale: Locale;
  fitRequest: number;
  activeId: string | null;
};
export function TransportMap({
  fleet,
  zone,
  config,
  selectedId,
  onSelect,
  locale,
  fitRequest,
  activeId,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    zoneLayer = useRef<L.GeoJSON | null>(null),
    markers = useRef(new Map<string, L.Marker>()),
    lastFleet = useRef(fleet),
    selectRef = useRef(onSelect),
    selectedRef = useRef(selectedId),
    lastFitRequest = useRef(fitRequest);
  lastFleet.current = fleet;
  selectRef.current = onSelect;
  selectedRef.current = selectedId;
  const [tileError, setTileError] = useState(false),
    t = text(locale);
  useEffect(() => {
    if (!host.current) return;
    const instance = L.map(host.current, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: true,
    });
    map.current = instance;
    L.control.zoom({ position: "topright" }).addTo(instance);
    L.control.attribution({ position: "bottomright", prefix: false }).addTo(instance);
    const tiles = L.tileLayer(config.tileUrl, {
      maxZoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(instance);
    tiles.on("tileerror", () => setTileError(true));
    tiles.on("load", () => {
      if (host.current?.querySelector(".leaflet-tile-loaded"))
        setTileError(false);
    });
    instance.fitBounds(
      lastFleet.current.items.map((v) => [v.latitude, v.longitude]),
      {
        paddingTopLeft: window.innerWidth > 760 ? [420, 70] : [40, 70],
        paddingBottomRight: [60, 70],
        maxZoom: 16,
      },
    );
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(host.current);
    return () => {
      resize.disconnect();
      markers.current.clear();
      instance.remove();
      map.current = null;
    };
  }, [config.tileUrl]);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    zoneLayer.current?.remove();
    zoneLayer.current = L.geoJSON(zone.geometry, {
      style: { color: "#6c886c", weight: 2, fillOpacity: 0.045 },
    }).addTo(instance);
  }, [zone]);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    for (const [selector, label] of [
      [".leaflet-control-zoom-in", t.zoomIn],
      [".leaflet-control-zoom-out", t.zoomOut],
    ] as const) {
      const button = instance.getContainer().querySelector(selector);
      button?.setAttribute("title", label);
      button?.setAttribute("aria-label", label);
    }
    const seen = new Set<string>();
    for (const vehicle of fleet.items) {
      seen.add(vehicle.id);
      const selected = vehicle.id === selectedId,
        own = vehicle.id === activeId;
      const title = `${vehicle.publicCode} · ${t[vehicle.status]} · ${Math.floor(vehicle.batteryBp / 100)}%`;
      const icon = L.divIcon({
        className: `transport-pin ${vehicle.status}${selected ? " selected" : ""}${own ? " own" : ""}`,
        html: scooterMarkup,
        iconSize: selected ? [36, 36] : [30, 30],
        iconAnchor: selected ? [18, 18] : [15, 15],
      });
      let marker = markers.current.get(vehicle.id);
      if (!marker) {
        marker = L.marker([vehicle.latitude, vehicle.longitude], {
          icon,
          keyboard: true,
          title,
          alt: title,
          riseOnHover: true,
          autoPanOnFocus: false,
        }).addTo(instance);
        marker.on("click", () => selectRef.current(vehicle.id));
        markers.current.set(vehicle.id, marker);
      }
      marker.setLatLng([vehicle.latitude, vehicle.longitude]);
      if (marker.options.icon?.options.className !== icon.options.className)
        marker.setIcon(icon);
      marker.setZIndexOffset(selected ? 1000 : own ? 500 : 0);
      const element = marker.getElement();
      if (element) {
        element.setAttribute("role", "button");
        element.setAttribute("aria-label", title);
        element.setAttribute("title", title);
      }
    }
    for (const [id, marker] of markers.current)
      if (!seen.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
  }, [fleet, selectedId, activeId, locale, t]);
  useEffect(() => {
    const vehicle = lastFleet.current.items.find(
      (v) => v.id === selectedRef.current,
    );
    const instance = map.current;
    const explicitFocus = fitRequest !== lastFitRequest.current;
    lastFitRequest.current = fitRequest;
    // Selecting a marker, receiving sync, or changing the active rental never pans.
    if (!explicitFocus) return;
    if (vehicle && instance) {
      instance.setView(
        [vehicle.latitude, vehicle.longitude],
        Math.max(instance.getZoom(), 16),
        { animate: false },
      );
      if (window.innerWidth <= 760)
        instance.panBy([0, Math.round(instance.getSize().y * 0.24)], {
          animate: false,
        });
    }
  }, [fitRequest]);
  function fitFleet() {
    map.current?.fitBounds(
      fleet.items.map((v) => [v.latitude, v.longitude]),
      { padding: [65, 65], maxZoom: 16 },
    );
  }
  return (
    <section className="transport-map" aria-label={t.map}>
      <div ref={host} className="map-canvas" />
      <div className="map-tools">
        <button type="button" onClick={fitFleet}>
          {t.allScooters}
        </button>
        <button
          type="button"
          onClick={() => {
            const bounds = zoneLayer.current?.getBounds();
            if (bounds) map.current?.fitBounds(bounds, { padding: [45, 45] });
          }}
        >
          {t.wholeZone}
        </button>
      </div>
      {tileError ? (
        <p className="tile-error" role="status">
          {t.tilesError}
        </p>
      ) : null}
      <div className="map-legend">
        <span className="legend-free">{t.available}</span>
        <span className="legend-booked">{t.reserved}</span>
        <span className="legend-riding">{t.in_ride}</span>
        <span className="legend-off">{t.unavailable}</span>
      </div>
    </section>
  );
}
