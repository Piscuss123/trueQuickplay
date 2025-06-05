
dotenv.config();

app.use(cors({
  origin: ['http://localhost:3000', 'https://Piscuss123.github.io'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

 fetch('https://api.steampowered.com/IGameServersService/GetServerList/v1/?key=72452A9717D5F298689C805539FFFFA4')
     .then(response => {
       if (!response.ok) {
         throw new Error(`HTTP error! status: ${response.status}`);
       }
       return response.json(); // Or response.text() for plain text
     })
     .then(data => {
       console.log(data); // Process the data
     })
     .catch(error => {
       console.error('Fetch error:', error);
     });
