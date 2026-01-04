const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// 1. DATABASE PATHS
const DB = {
    services: path.join(__dirname, 'data-service.json'),
    units: path.join(__dirname, 'data-units.json'),
    transactions: path.join(__dirname, 'data-transactions.json'),
    parts: path.join(__dirname, 'data-parts.json')
};

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// 2. ROBUST JSON HELPER
const readJSON = (filePath) => {
    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify([]));
            return [];
        }
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content || '[]');
    } catch (e) {
        console.error("Gagal baca file:", filePath);
        return [];
    }
};

const writeJSON = (filePath, data) => fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

// --- 3. API DETAIL UNIT (FIXED LOGIC) ---
app.get('/api/units/detail/:plate', (req, res) => {
    const searchPlate = req.params.plate.toUpperCase().trim();
    
    const units = readJSON(DB.units);
    const services = readJSON(DB.services);
    const transactions = readJSON(DB.transactions);

    // Cari Info Unit
    const unitInfo = units.find(u => u.plate.toUpperCase() === searchPlate);

    if (unitInfo) {
        // FILTERING DATA: Pastikan nama key 'plateNumber' sesuai dengan yang di-input
        // Kita gunakan .toUpperCase() agar pencarian akurat meski input berbeda case
        const historyServis = services.filter(s => 
            (s.plateNumber && s.plateNumber.toUpperCase() === searchPlate)
        );

        const historyKeuangan = transactions.filter(t => 
            (t.plateNumber && t.plateNumber.toUpperCase() === searchPlate)
        );

        res.json({
            unit: unitInfo,
            services: historyServis,
            transactions: historyKeuangan
        });
    } else {
        res.status(404).json({ message: "Unit tidak ditemukan" });
    }
});

// --- 4. API LAINNYA (INDEX & KASIR) ---
app.get('/api/transactions', (req, res) => res.json(readJSON(DB.transactions)));
app.get('/api/services', (req, res) => res.json(readJSON(DB.services)));
app.get('/api/units', (req, res) => res.json(readJSON(DB.units)));
app.get('/api/parts', (req, res) => res.json(readJSON(DB.parts)));

// Input Log Servis Terpadu
app.post('/api/service', (req, res) => {
    const services = readJSON(DB.services);
    const transactions = readJSON(DB.transactions);
    const units = readJSON(DB.units);
    
    const serviceId = Date.now();
    const unitPlate = req.body.plateNumber.toUpperCase().trim();
    const unit = units.find(u => u.plate.toUpperCase() === unitPlate);
    
    const isBrother = unit && unit.category === 'BROTHER';
    const type = isBrother ? 'EXPENSE' : 'INCOME';
    const category = isBrother ? 'Maintenance' : 'Workshop Sale';

    const newService = {
        id: serviceId,
        plateNumber: unitPlate,
        mileage: req.body.mileage,
        serviceDate: req.body.serviceDate,
        workshopName: req.body.workshopName,
        cost: parseInt(req.body.cost),
        description: req.body.description
    };

    const newTrans = {
        id: Date.now() + 1,
        type: type,
        amount: parseInt(req.body.cost),
        category: category,
        description: `Servis: ${req.body.workshopName}`,
        plateNumber: unitPlate,
        status: 'PAID',
        relatedId: serviceId,
        date: req.body.serviceDate
    };

    services.push(newService);
    transactions.push(newTrans);
    
    writeJSON(DB.services, services);
    writeJSON(DB.transactions, transactions);
    res.redirect('/index.html?status=success');
});

// Penjualan Bengkel (Workshop POS)
app.post('/api/workshop/sale', (req, res) => {
    const trans = readJSON(DB.transactions);
    const parts = readJSON(DB.parts);
    
    const laborFee = parseInt(req.body.laborFee || 0);
    const unitPlate = req.body.plateNumber.toUpperCase().trim();
    let total = laborFee;
    let desc = req.body.customAction || "Servis";

    if (req.body.selectedPartId) {
        const pIdx = parts.findIndex(p => p.id == req.body.selectedPartId);
        if (pIdx !== -1) {
            const qty = parseInt(req.body.partQty || 1);
            total += (parts[pIdx].price * qty);
            desc += ` + ${parts[pIdx].name}`;
            parts[pIdx].stock -= qty;
            writeJSON(DB.parts, parts);
        }
    }

    trans.push({
        id: Date.now(),
        type: 'INCOME',
        amount: total,
        category: 'Workshop Sale',
        plateNumber: unitPlate,
        description: desc,
        status: req.body.status || 'PAID',
        date: new Date().toISOString().split('T')[0]
    });

    writeJSON(DB.transactions, trans);
    res.redirect('/cashier.html');
});

app.listen(PORT, () => console.log(`Brother Trans Engine Active on Port ${PORT}`));