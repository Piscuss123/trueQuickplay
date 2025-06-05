const express = import('express');
const cors = import('cors');
const dotenv = import('dotenv');
const axios = import('axios');
// Add this near the top of your file
const path = import('path');
const { queryGameServerInfo } = import('steam-server-query');
const net = import('net');
const { promisify } = import('util');
const ping = import('ping');
	
dotenv.config();
	
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
	origin: ['http://localhost:3000', ''],
	methods: ['GET', 'POST', 'PUT', 'DELETE'],
	credentials: true
}));
app.use(express.json());

// Add a simple health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'TrueQuickplay API is running' });
});

const CACHE_EXPIRATION = 5 * 60 * 1000;

let requestCounter = 0;

app.get('/api/servers', async (req, res) => {
  const requestId = ++requestCounter;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];
  
  console.log(`[${requestId}] Server request from ${clientIp} - ${new Date().toISOString()}`);
  console.log(`[${requestId}] User-Agent: ${userAgent}`);
  
  try {
    const forceRefresh = req.query.refresh === 'true';
    const now = Date.now();
    
    // Use cached data if available and not expired
    if (!forceRefresh && serverCache.data && (now - serverCache.timestamp < CACHE_EXPIRATION)) {
      console.log(`[${requestId}] Returning cached server data (age: ${Math.round((now - serverCache.timestamp) / 1000)}s)`);
      return res.status(200).json({ 
        servers: serverCache.data, 
        isMockData: serverCache.isMockData,
        fromCache: true,
        cacheAge: Math.round((now - serverCache.timestamp) / 1000) + ' seconds',
        requestId: requestId
      });
    }
	
	// Get the list of TF2 servers from Steam Master Server
    const steamApiKey = process.env.STEAM_API_KEY;
    const appId = 440; // TF2 App ID
    
    // Query the Steam Master Server API for servers with the tag
    const response = await axios.get('https://api.steampowered.com/IGameServersService/GetServerList/v1/', {
      params: {
        key: steamApiKey,
        filter: `\\appid\\${appId}\\gametagsand\\truequickplay`,
        limit: 100
      }
    });
        console.log('API Response Status:', response.status);
    
    // Check if we have servers
    if (!response.data || !response.data.response || !response.data.response.servers || response.data.response.servers.length === 0) {
      console.log('No servers found with the truequickplay tag. Using mock data for development.');
      
      // Provide mock data for development/testing purposes
      const mockServers = [
        { 
          id: 'mock1',
          name: 'TrueQuickplay Test Server',
          map: 'cp_dustbowl',
          gamemode: 'Control Points',
          players: '12/24',
          region: 'North America East',
          address: '127.0.0.1:27015'
        },
        {
          id: 'mock2',
          name: 'Community Server #1',
          map: 'pl_upward',
          gamemode: 'Payload',
          players: '18/24',
          region: 'Europe',
          address: '127.0.0.1:27016'
        },
        {
          id: 'mock3',
          name: '2Fort 24/7',
          map: 'ctf_2fort',
          gamemode: 'Capture the Flag',
          players: '22/24',
          region: 'Asia Pacific',
          address: '127.0.0.1:27017'
        }
      ];
      
      // Update cache
      serverCache.data = mockServers;
      serverCache.timestamp = now;
      serverCache.isMockData = true;
      
      return res.status(200).json({ 
        servers: mockServers, 
        isMockData: true,
        fromCache: false
      });
    }
    
    const servers = response.data.response.servers;
    
    // Get detailed info for each server
    const serverDetailsPromises = servers.map(async (server) => {
      try {
        // Make sure we have a valid address
        if (!server.addr || !server.addr.includes(':')) {
          console.log(`Invalid server address: ${server.addr}`);
          return null;
        }
    
        const address = server.addr.split(':');
        const ip = address[0];
        
        // Determine gamemode from map prefix
        let gamemode = 'Unknown';
        if (server.map) {
          const mapPrefix = server.map.split('_')[0];
          switch (mapPrefix) {
            case 'cp':
              gamemode = 'Control Points';
              break;
            case 'pl':
              gamemode = 'Payload';
              break;
            case 'plr':
              gamemode = 'Payload Race';
              break;
            case 'ctf':
              gamemode = 'Capture the Flag';
              break;
            case 'koth':
              gamemode = 'King of the Hill';
              break;
            case 'arena':
              gamemode = 'Arena';
              break;
            case 'mvm':
              gamemode = 'Mann vs Machine';
              break;
            case 'sd':
              gamemode = 'Special Delivery';
              break;
            case 'tc':
              gamemode = 'Territorial Control';
              break;
            case 'tr':
              gamemode = 'Training';
              break;
            case 'pd':
              gamemode = 'Player Destruction';
              break;
            case 'pass':
              gamemode = 'PASS Time';
              break;
            case 'rd':
              gamemode = 'Robot Destruction';
              break;
            case 'mge':
              gamemode = 'MGE';
              break;
            case 'jump':
              gamemode = 'Jump';
              break;
            case 'trade':
              gamemode = 'Trade';
              break;
            default:
              gamemode = 'Other';
          }
        }
        
        // Use the data from the Steam API response
        return {
          id: server.addr,
          name: server.name || 'Unknown Server',
          map: server.map || 'Unknown Map',
          gamemode: gamemode,
          players: `${server.players}/${server.max_players}`,
          region: getRegionFromIP(ip),
          address: server.addr
        };
      } catch (error) {
        console.error(`Error processing server ${server.addr}:`, error);
        return null;
      }
    });
    
    const serverDetails = (await Promise.all(serverDetailsPromises)).filter(server => server !== null);
    
    // Update cache
    serverCache.data = serverDetails;
    serverCache.timestamp = now;
    serverCache.isMockData = false;
    
    res.status(200).json({ 
      servers: serverDetails,
      fromCache: false
    });
  } catch (error) {
    console.error('Error fetching servers:', error);
    
    // If we have cached data, return it as a fallback
    if (serverCache.data) {
      console.log('Returning cached data as fallback after error');
      return res.status(200).json({ 
        servers: serverCache.data, 
        isMockData: serverCache.isMockData,
        fromCache: true,
        isErrorFallback: true
      });
    }
    
    res.status(500).json({ message: 'Error fetching servers', error: error.message });
  }
});
