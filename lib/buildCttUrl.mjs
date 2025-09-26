export  function buildCttUrl(trackingCode) {
  if (!trackingCode || typeof trackingCode !== "string") {
    throw new Error("trackingCode inválido");
  }
  const code = encodeURIComponent(trackingCode.trim());
  return `https://appserver.ctt.pt/CustomerArea/PublicArea_Detail?ObjectCodeInput=${code}&SearchInput=${code}&IsFromPublicArea=true`;
}

