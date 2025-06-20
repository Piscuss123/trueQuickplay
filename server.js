const params = new URLSearchParams({
  key: processs.env.API_KEY
});

 fetch('https://api.steampowered.com/IGameServersService/GetServerList/v1/?${params}')
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
