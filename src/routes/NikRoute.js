import express from "express";
import cekNik from "../controllers/CekNik.js";

const NikRoutes = express.Router();

NikRoutes.get("/cek", cekNik);

export default NikRoutes;