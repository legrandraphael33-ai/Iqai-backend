export default function handler(request, response) {
  // On accepte tout pour le test
  response.setHeader('Access-Control-Allow-Origin', '*');
  
  if (request.method === 'POST') {
    return response.status(200).json({ message: "Test réussi sans Redis !" });
  }

  if (request.method === 'GET') {
    return response.status(200).json([{ member: "Testeur", score: 100 }]);
  }
}
