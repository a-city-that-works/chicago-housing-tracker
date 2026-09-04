/**
 * Shared basemap config for every map on the site.
 *
 * Previously CARTO's basemaps.cartocdn.com, duplicated in each map component.
 * CARTO began requiring an API key and started serving tiles stamped
 * "API KEY REQUIRED" — still HTTP 200, so nothing failed loudly; the maps just
 * quietly went wrong in both places at once. Hence one definition here.
 *
 * Esri's gray canvas is keyless, unlabelled and low-contrast, which is what a
 * choropleth wants: the data carries the colour, the basemap only gives
 * orientation. Note the {z}/{y}/{x} ordering — Esri differs from the usual
 * {z}/{x}/{y}.
 */
const ESRI = "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas";

export const BASEMAP_LIGHT = `${ESRI}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`;
export const BASEMAP_DARK = `${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`;

export const BASEMAP_ATTRIBUTION =
  'Tiles &copy; <a href="https://www.esri.com/">Esri</a> — Esri, HERE, Garmin, ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function basemapUrl(dark: boolean): string {
  return dark ? BASEMAP_DARK : BASEMAP_LIGHT;
}
