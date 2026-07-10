async function main() {
  console.log('Triggering catalog sync via POST /api/products/sync...');
  const triggerRes = await fetch('http://localhost:3000/api/products/sync', { method: 'POST' });
  const triggerData = await triggerRes.json();
  console.log('Trigger response:', triggerData);

  if (triggerData.status === 'failed') {
    console.error('Sync failed to start.');
    return;
  }

  console.log('Polling sync progress...');
  let completed = false;
  while (!completed) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
      const progressRes = await fetch('http://localhost:3000/api/products/sync/progress');
      const progress = await progressRes.json();
      console.log(`Status: ${progress.status}, Progress: ${progress.current}/${progress.estimatedTotal}`);
      if (progress.status === 'completed') {
        completed = true;
        console.log('Sync completed successfully!');
      } else if (progress.status === 'failed') {
        completed = true;
        console.error('Sync failed:', progress.error);
      }
    } catch (err) {
      console.error('Error polling progress:', err.message);
    }
  }
}

main().catch(console.error);
