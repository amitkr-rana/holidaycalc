export const getAirlineLogoUrl = (iataCode: string): string => {
  if (iataCode) {
    // Construct the path directly from the IATA code.
    return `/logos/${iataCode.toUpperCase()}.png`;
  }
  // Return the path to your fallback image
  return "/plane.svg";
};