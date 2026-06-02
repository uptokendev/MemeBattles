const publicSiteUrl = "https://memewar.zone";

document.addEventListener(
  "click",
  (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const brandLink = target?.closest?.(".mwz-brand-link");
    if (!brandLink) return;

    event.preventDefault();
    window.location.assign(publicSiteUrl);
  },
  true,
);
