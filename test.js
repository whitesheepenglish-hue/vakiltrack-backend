fetch('http://[::1]:3000/test')
  .then(response => response.json())
  .then(data => console.log(JSON.stringify(data)))
  .catch(error => console.error(error));