// This code contains WebContainer runtime assumptions
const isWebContainer = typeof window !== 'undefined' && window.location.origin.includes('webcontainer');
console.log('Running inside stackblitz:', isWebContainer);
