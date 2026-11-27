if (location.hash === "#conexiones") view = { type: "ajustes", section: "conexiones" };
applyZoom(loadZoom());
rememberTab(view);
renderShell();
void loadState();
setInterval(() => void loadState(), 2500);
setInterval(() => void loadMessages(), 2000);
setInterval(() => void loadExtra(), 20000);
void loadExtra();
