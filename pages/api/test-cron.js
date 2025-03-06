export default async function handler(req, res) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado' });
    }
  
    try {
      console.log("Cron de prueba ejecutado en Vercel");
      return res.status(200).json({ message: "Cron de prueba ejecutado con éxito" });
    } catch (error) {
      console.error("Error en el cron de prueba:", error);
      return res.status(500).json({ error: error.message });
    }
  }