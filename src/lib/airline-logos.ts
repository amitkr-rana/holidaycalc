// src/lib/airline-logos.ts
import icaoToIata from "./icao_to_iata.json";

// Create a reverse mapping from IATA to ICAO
const iataToIcao: { [key: string]: string } = Object.entries(
  icaoToIata
).reduce((acc, [icao, iata]) => {
  if (typeof iata === "string") {
    acc[iata] = icao;
  }
  return acc;
}, {} as { [key: string]: string });

export const getAirlineLogoUrl = (iataCode: string): string => {
  const icaoCode = iataToIcao[iataCode];
  if (icaoCode) {
    return `/airline-logos/${icaoCode}.png`;
  }
  // Return the path to your fallback image
  return "/path/to/your/fallback-image.png"; // Make sure this path is correct
};