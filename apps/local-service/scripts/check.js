(async () => {
  try {
    const response = await fetch('http://127.0.0.1:37841/health');
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
    process.exit(response.ok && data.ok ? 0 : 1);
  } catch (error) {
    console.error('Service is not running:', error.message);
    process.exit(1);
  }
})();
