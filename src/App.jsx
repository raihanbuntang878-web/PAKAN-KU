import React, { useState, useEffect } from 'react';
import { 
  Home, ShoppingCart, User as UserIcon, Search, 
  Star, ChevronLeft, Plus, Minus, Trash2, Package, 
  MapPin, Store, Leaf, LogOut, Edit2, Check, Upload, 
  Banknote, Truck, Map
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, signOut, onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, setDoc, updateDoc, 
  deleteDoc, onSnapshot, getDoc 
} from 'firebase/firestore';

// ==========================================
// 1. FIREBASE CONFIGURATION (SESUAI REQUEST)
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyCIS1GZk6x89ITAIAaxaHxg_w00mcv2J-k",
  authDomain: "pakanku-app.firebaseapp.com",
  projectId: "pakanku-app",
  storageBucket: "pakanku-app.firebasestorage.app",
  messagingSenderId: "600847552162",
  appId: "1:600847552162:web:7c2e8b5c4612554ca291fb",
  measurementId: "G-EZMM4VZWD8"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================
// 2. SUPABASE CONFIGURATION (DIPERBARUI)
// ==========================================
const supabaseUrl = 'https://yyuajrvowmdxgncaskfs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5dWFqcnZvd21keGduY2Fza2ZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MjE0MzEsImV4cCI6MjA5MTM5NzQzMX0.MxfraBhGajHchVMWI4qHz_kN1ufVmPq6STTXeudQ3RA';

// BUCKET TELAH DIPERBAIKI MENJADI 'images'
const supabaseBucket = 'images'; 

const categories = [
  { id: 'c1', name: 'Ayam', icon: '🐔' },
  { id: 'c2', name: 'Ikan', icon: '🐟' },
  { id: 'c3', name: 'Sapi', icon: '🐄' },
  { id: 'c4', name: 'Burung', icon: '🐦' },
  { id: 'c5', name: 'Kucing', icon: '🐱' },
  { id: 'c6', name: 'Lainnya', icon: '🐾' },
];

export default function App() {
  // --- GLOBAL STATE ---
  const [user, setUser] = useState(null); 
  const [userProfile, setUserProfile] = useState(null);
  
  const [activeTab, setActiveTab] = useState('home'); 
  const [activeView, setActiveView] = useState('auth'); 
  
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState([]);
  
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [toast, setToast] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // --- HELPERS ---
  const formatRp = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num || 0);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };
  
  const navigateTo = (view, tab = activeTab) => {
    setActiveView(view);
    if (view === 'main') setActiveTab(tab);
  };

  // --- SUPABASE UPLOAD FUNCTION (DIPERBARUI) ---
  const uploadToSupabase = async (file) => {
    if (!file) return null;
    try {
      // Bersihkan nama file dari spasi atau karakter aneh yang bisa bikin error URL
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
      const fileName = `${Date.now()}-${safeName}`;

      // Upload file menggunakan REST API fetch (Lebih stabil tanpa library external)
      const res = await fetch(`${supabaseUrl}/storage/v1/object/${supabaseBucket}/${fileName}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': file.type
        },
        body: file
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Upload failed');
      }

      return `${supabaseUrl}/storage/v1/object/public/${supabaseBucket}/${fileName}`;
    } catch (err) {
      console.error("Upload exception:", err);
      showToast('Terjadi kesalahan saat upload gambar.');
      return null;
    }
  };

  // --- FIREBASE EFFECTS ---

  // 1. Fetch Products (Global - Buyer bisa lihat walau belum login/baru login)
  useEffect(() => {
    const prodRef = collection(db, 'products');
    const unsubProducts = onSnapshot(prodRef, (snapshot) => {
      const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(prods);
    });
    return () => unsubProducts();
  }, []);

  // 2. Auth Listener
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setUserProfile(null);
        setOrders([]);
        setActiveView('auth');
        setIsLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // 3. User & Orders Listener
  useEffect(() => {
    if (!user) return;
    
    // Listen User Profile
    const userRef = doc(db, 'users', user.uid);
    const unsubUser = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserProfile(data);
        if (activeView === 'auth') {
          navigateTo('main', data.role === 'seller' ? 'dashboard' : 'home');
        }
      }
      setIsLoading(false);
    });

    // Listen Orders
    const ordRef = collection(db, 'orders');
    const unsubOrders = onSnapshot(ordRef, (snapshot) => {
      const ords = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      ords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setOrders(ords);
    });

    return () => {
      unsubUser();
      unsubOrders();
    };
  }, [user]);

  // --- CART FUNCTIONS ---
  const addToCart = (product) => {
    if (product.stock <= 0) {
      showToast('Maaf, stok produk habis!'); return;
    }
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.qty + 1 > product.stock) {
          showToast('Maksimal stok tercapai!'); return prev;
        }
        return prev.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { ...product, qty: 1 }];
    });
    showToast('Berhasil ditambahkan ke keranjang!');
  };

  const updateCartQty = (id, delta) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = item.qty + delta;
        if (newQty > product.stock) {
          showToast('Maksimal stok tercapai!'); return item;
        }
        return newQty > 0 ? { ...item, qty: newQty } : item;
      }
      return item;
    }));
  };

  const removeCartItem = (id) => setCart(prev => prev.filter(item => item.id !== id));
  const getCartTotal = () => cart.reduce((total, item) => total + (item.price * item.qty), 0);

  // --- VIEWS ---
  if (isLoading && activeView !== 'auth') {
    return <div className="flex h-screen items-center justify-center bg-[#FFF8E1] text-[#8D6E63] font-bold">Memuat data Pakanku...</div>;
  }

  const AuthView = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'buyer' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
      e.preventDefault();
      setError('');
      setLoading(true);
      try {
        if (isLogin) {
          await signInWithEmailAndPassword(auth, formData.email, formData.password);
        } else {
          if (!formData.name) throw new Error("Nama harus diisi");
          const userCred = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
          await setDoc(doc(db, 'users', userCred.user.uid), {
            id: userCred.user.uid,
            name: formData.name,
            role: formData.role,
            email: formData.email,
            phone: '',
            address: '',
            mapLink: '',
            photoProfile: '',
            bankName: '',
            bankNumber: ''
          });
        }
      } catch (err) {
        setError(err.message.replace('Firebase:', ''));
      }
      setLoading(false);
    };

    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#4CAF50] text-white p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-green-400 rounded-full mix-blend-multiply filter blur-3xl opacity-70"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#8D6E63] rounded-full mix-blend-multiply filter blur-3xl opacity-50"></div>
        
        <div className="w-24 h-24 bg-[#FFF8E1] rounded-full flex items-center justify-center mb-4 shadow-lg z-10">
          <Leaf className="text-[#4CAF50] w-12 h-12" />
        </div>
        <h1 className="text-4xl font-bold mb-1 z-10 text-white">Pakanku</h1>
        
        {/* PENAMBAHAN NAMA PEMBUAT */}
        <p className="text-sm font-bold text-[#FFF8E1] z-10 mb-4 tracking-wider drop-shadow-md">
          Created by : M. Raihan
        </p>

        <p className="mb-8 text-[#FFF8E1] text-center z-10">Marketplace Pakan Ternak<br/><span className="text-sm opacity-90">Dari Peternak, Untuk Peternak</span></p>
        
        <div className="w-full max-w-sm space-y-4 bg-[#FFF8E1] p-6 rounded-3xl shadow-2xl text-[#5D4037] z-10 border border-[#8D6E63]/20">
          <h2 className="font-bold text-center text-xl mb-4">{isLogin ? 'Masuk ke Akun Anda' : 'Buat Akun Baru'}</h2>
          {error && <div className="bg-red-100 text-red-600 p-3 rounded-xl text-xs text-center font-medium">{error}</div>}
          
          <form onSubmit={handleSubmit} className="space-y-3">
            {!isLogin && (
              <input type="text" placeholder="Nama Lengkap / Toko" required
                className="w-full px-4 py-3 rounded-xl border border-[#8D6E63]/30 focus:outline-none focus:ring-2 focus:ring-[#4CAF50] bg-white"
                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
              />
            )}
            <input type="email" placeholder="Email" required
              className="w-full px-4 py-3 rounded-xl border border-[#8D6E63]/30 focus:outline-none focus:ring-2 focus:ring-[#4CAF50] bg-white"
              value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}
            />
            <input type="password" placeholder="Password" required minLength="6"
              className="w-full px-4 py-3 rounded-xl border border-[#8D6E63]/30 focus:outline-none focus:ring-2 focus:ring-[#4CAF50] bg-white"
              value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})}
            />
            
            {!isLogin && (
              <div className="flex gap-2 pt-2">
                <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer font-medium text-sm transition ${formData.role === 'buyer' ? 'bg-[#4CAF50]/10 border-[#4CAF50] text-[#4CAF50]' : 'bg-white border-[#8D6E63]/30 text-[#8D6E63]'}`}>
                  <input type="radio" className="hidden" checked={formData.role === 'buyer'} onChange={() => setFormData({...formData, role: 'buyer'})} />
                  🛒 Pembeli
                </label>
                <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer font-medium text-sm transition ${formData.role === 'seller' ? 'bg-[#8D6E63]/10 border-[#8D6E63] text-[#8D6E63]' : 'bg-white border-[#8D6E63]/30 text-[#8D6E63]'}`}>
                  <input type="radio" className="hidden" checked={formData.role === 'seller'} onChange={() => setFormData({...formData, role: 'seller'})} />
                  🏪 Penjual
                </label>
              </div>
            )}
            
            <button disabled={loading} type="submit" className="w-full bg-[#4CAF50] text-white py-3.5 rounded-xl font-bold hover:bg-[#388E3C] transition shadow-md mt-4 disabled:opacity-70 flex justify-center items-center">
              {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : (isLogin ? 'Masuk' : 'Daftar')}
            </button>
          </form>

          <p className="text-center text-sm font-medium text-[#8D6E63] mt-4">
            {isLogin ? "Belum punya akun?" : "Sudah punya akun?"} 
            <button onClick={() => { setIsLogin(!isLogin); setError(''); }} className="text-[#4CAF50] font-bold ml-1 hover:underline">
              {isLogin ? 'Daftar' : 'Masuk'}
            </button>
          </p>
        </div>
      </div>
    );
  };

  const BuyerHomeTab = () => (
    <div className="flex flex-col h-full overflow-y-auto bg-[#FFF8E1] pb-24 relative">
      <div className="bg-[#4CAF50] p-4 sticky top-0 z-10 shadow-sm rounded-b-2xl">
        <div className="flex gap-2">
          <div className="flex-1 bg-white rounded-xl flex items-center px-4 py-2 shadow-inner">
            <Search size={20} className="text-gray-400" />
            <input type="text" placeholder="Cari pakan ternak..." className="ml-2 w-full outline-none text-sm text-[#5D4037]" />
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="bg-gradient-to-r from-[#8D6E63] to-[#5D4037] rounded-2xl h-36 flex items-center p-5 text-white shadow-lg relative overflow-hidden">
          <div className="z-10">
            <h3 className="font-bold text-xl mb-1 text-[#FFF8E1]">Panen Berkah!</h3>
            <p className="text-sm text-[#FFF8E1]/80 mb-3">Temukan pakan terbaik langsung dari pabrik</p>
          </div>
          <Leaf size={100} className="absolute -right-6 -bottom-6 text-[#A1887F] opacity-40 rotate-12" />
        </div>
      </div>

      <div className="p-4">
        <h3 className="font-bold text-[#5D4037] mb-4 flex items-center gap-2 text-lg">
          <span className="bg-[#4CAF50] w-1.5 h-6 rounded-full"></span> Pilihan Peternak
        </h3>
        {products.length === 0 ? (
          <div className="text-center text-[#8D6E63] mt-10 opacity-70 font-medium">Belum ada produk pakan tersedia.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {products.map(product => (
              <div key={product.id} onClick={() => { setSelectedProduct(product); navigateTo('product'); }}
                className={`bg-white rounded-2xl overflow-hidden shadow-sm border border-[#8D6E63]/20 cursor-pointer transition-transform relative ${product.stock <= 0 ? 'opacity-70' : 'hover:shadow-md'}`}
              >
                {product.stock <= 0 && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10">
                    <span className="bg-red-600 text-white font-bold px-3 py-1 rounded-full text-[10px] shadow-lg">Habis Terjual</span>
                  </div>
                )}
                <div className="relative">
                  <img src={product.image || "https://images.unsplash.com/photo-1524704654690-b56c05c78a00?auto=format&fit=crop&q=80"} alt={product.name} className="w-full aspect-square object-cover bg-gray-100" />
                  <div className="absolute bottom-2 left-2 bg-[#5D4037]/70 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Star size={10} className="fill-yellow-400 text-yellow-400"/> {product.rating || 'Baru'}
                  </div>
                </div>
                <div className="p-3">
                  <h4 className="text-sm font-medium text-[#5D4037] line-clamp-2 leading-tight mb-1.5 min-h-[2.5rem]">{product.name}</h4>
                  <p className="text-[#4CAF50] font-bold text-base mb-2">{formatRp(product.price)}</p>
                  <div className="flex items-center justify-between text-xs text-[#8D6E63] font-medium">
                    <span>Stok: {product.stock}</span>
                    <span>Terjual: {product.sold || 0}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 mb-6 text-center text-xs text-[#8D6E63] font-bold tracking-widest opacity-60">
        CREATED BY: M. RAIHAN
      </div>
    </div>
  );

  const ProductDetailView = () => {
    if (!selectedProduct) return null;
    const isOutOfStock = selectedProduct.stock <= 0;

    return (
      <div className="flex flex-col h-screen bg-[#FFF8E1]">
        <div className="absolute top-4 left-4 z-20">
          <button onClick={() => navigateTo('main')} className="bg-[#5D4037]/60 p-2.5 rounded-full text-white backdrop-blur-md shadow-lg hover:bg-[#5D4037] transition">
            <ChevronLeft size={24} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto pb-24">
          <div className="relative">
            <img src={selectedProduct.image || "https://images.unsplash.com/photo-1524704654690-b56c05c78a00?auto=format&fit=crop&q=80"} alt={selectedProduct.name} className="w-full aspect-square object-cover bg-gray-100" />
            {isOutOfStock && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <span className="bg-red-600 text-white font-bold px-6 py-2 rounded-full text-lg shadow-2xl border-2 border-white/20">STOK HABIS</span>
              </div>
            )}
          </div>
          
          <div className="bg-white p-5 mb-2 shadow-sm border-b border-[#8D6E63]/20 rounded-b-3xl">
            <div className="text-[#4CAF50] font-bold text-3xl mb-2">{formatRp(selectedProduct.price)}</div>
            <h1 className="text-xl text-[#5D4037] font-bold leading-snug mb-4">{selectedProduct.name}</h1>
            <div className="flex items-center gap-4 text-sm font-medium text-[#8D6E63]">
              <span className="flex items-center gap-1.5"><Star size={18} className="text-yellow-400 fill-yellow-400" /> {selectedProduct.rating || '0'}</span>
              <span className="w-1 h-1 rounded-full bg-[#8D6E63]/40"></span>
              <span>Terjual {selectedProduct.sold || 0}</span>
              <span className="w-1 h-1 rounded-full bg-[#8D6E63]/40"></span>
              <span className={isOutOfStock ? 'text-red-500 font-bold' : ''}>Stok: {selectedProduct.stock}</span>
            </div>
          </div>

          <div className="bg-white p-4 mb-2 flex items-center gap-4 shadow-sm border-y border-[#8D6E63]/20">
            <div className="w-14 h-14 bg-[#FFF8E1] border border-[#8D6E63]/30 rounded-full flex items-center justify-center shadow-inner">
              <Store size={28} className="text-[#8D6E63]" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-[#5D4037] text-lg">{selectedProduct.sellerName}</h3>
              <p className="text-xs font-medium text-[#8D6E63] flex items-center gap-1 mt-0.5"><MapPin size={12}/> Toko Pakan Terpercaya</p>
            </div>
          </div>

          <div className="bg-white p-5 shadow-sm border-t border-[#8D6E63]/20">
            <h3 className="font-bold text-[#5D4037] mb-3 text-lg">Deskripsi Pakan</h3>
            <p className="text-sm text-[#8D6E63] leading-relaxed whitespace-pre-line font-medium">{selectedProduct.desc}</p>
          </div>
        </div>

        {userProfile?.role === 'buyer' && (
          <div className="bg-white border-t border-[#8D6E63]/20 p-3 flex gap-2 fixed bottom-0 w-full shadow-[0_-8px_15px_-3px_rgba(0,0,0,0.05)] z-30">
            <button disabled={isOutOfStock} onClick={() => addToCart(selectedProduct)}
              className={`flex-1 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition border-2 ${isOutOfStock ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-[#4CAF50]/10 text-[#4CAF50] border-[#4CAF50]/30 hover:bg-[#4CAF50]/20'}`}>
              <ShoppingCart size={20} /> Keranjang
            </button>
            <button disabled={isOutOfStock} onClick={() => { addToCart(selectedProduct); if(!isOutOfStock) navigateTo('main', 'cart'); }}
              className={`flex-1 font-bold py-3.5 rounded-xl shadow-md transition ${isOutOfStock ? 'bg-gray-300 text-white cursor-not-allowed' : 'bg-[#4CAF50] text-white hover:bg-[#388E3C]'}`}>
              Beli Sekarang
            </button>
          </div>
        )}
      </div>
    );
  };

  const CartTab = () => (
    <div className="flex flex-col h-screen bg-[#FFF8E1]">
      <div className="bg-[#4CAF50] p-4 text-center font-bold text-lg text-white shadow-sm sticky top-0 z-10 rounded-b-2xl">Keranjang Belanja</div>
      
      <div className="flex-1 overflow-y-auto p-4 pb-32">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#8D6E63] gap-4 mt-24">
            <ShoppingCart size={64} className="text-[#8D6E63]/50" />
            <p className="font-medium text-lg">Keranjang masih kosong</p>
            <button onClick={() => setActiveTab('home')} className="mt-2 px-8 py-3 bg-[#4CAF50] text-white rounded-full font-bold shadow-md hover:bg-[#388E3C] transition">Beli Pakan Dulu</button>
          </div>
        ) : (
          <div className="space-y-4">
            {cart.map(item => {
              const productData = products.find(p => p.id === item.id);
              const isExceeding = item.qty > (productData?.stock || 0);

              return (
                <div key={item.id} className="bg-white p-4 rounded-2xl shadow-sm border border-[#8D6E63]/20 flex gap-4">
                  <img src={item.image} alt={item.name} className="w-24 h-24 rounded-xl object-cover border border-[#FFF8E1]" />
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-[#5D4037] line-clamp-2 leading-tight mb-1">{item.name}</h4>
                      <p className="text-[#4CAF50] font-bold text-base">{formatRp(item.price)}</p>
                    </div>
                    {isExceeding && <p className="text-xs font-bold text-red-500 mt-1">Stok sisa {productData?.stock || 0}!</p>}
                    <div className="flex items-center justify-between mt-2">
                      <button onClick={() => removeCartItem(item.id)} className="text-[#8D6E63]/50 hover:text-red-500 transition"><Trash2 size={20} /></button>
                      <div className="flex items-center gap-3 bg-[#FFF8E1] border border-[#8D6E63]/30 rounded-lg px-2 py-1 shadow-inner">
                        <button onClick={() => updateCartQty(item.id, -1)} className="text-[#8D6E63] p-1 hover:bg-[#8D6E63]/20 rounded-md transition"><Minus size={16} /></button>
                        <span className="text-sm font-bold w-6 text-center text-[#5D4037]">{item.qty}</span>
                        <button onClick={() => updateCartQty(item.id, 1)} className="text-[#8D6E63] p-1 hover:bg-[#8D6E63]/20 rounded-md transition"><Plus size={16} /></button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div className="bg-white border-t border-[#8D6E63]/20 p-4 pb-20 fixed bottom-0 w-full flex items-center justify-between shadow-[0_-8px_15px_-3px_rgba(0,0,0,0.05)] z-20">
          <div>
            <p className="text-xs font-medium text-[#8D6E63] mb-0.5">Total Harga</p>
            <p className="text-xl font-bold text-[#4CAF50]">{formatRp(getCartTotal())}</p>
          </div>
          <button 
            onClick={() => navigateTo('checkout')}
            disabled={cart.some(item => item.qty > (products.find(p=>p.id===item.id)?.stock || 0))}
            className="bg-[#4CAF50] disabled:bg-gray-400 text-white px-8 py-3.5 rounded-xl font-bold shadow-md hover:bg-[#388E3C] transition">
            Checkout ({cart.reduce((a,b)=>a+b.qty,0)})
          </button>
        </div>
      )}
    </div>
  );

  const CheckoutView = () => {
    const [method, setMethod] = useState('COD');
    const [courier, setCourier] = useState('JNE');
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [sellerBanks, setSellerBanks] = useState([]);

    // Ongkir Statis
    const ongkirMap = { 'JNE': 15000, 'J&T': 12000, 'SiCepat': 10000 };
    const subtotal = getCartTotal();
    const ongkir = ongkirMap[courier];
    const total = subtotal + ongkir;

    // Fetch Seller Banks jika metode adalah Transfer Bank
    useEffect(() => {
      const fetchSellerBanks = async () => {
        if (method !== 'Transfer Bank') return;
        const uniqueSellerIds = [...new Set(cart.map(c => c.sellerId))];
        const banks = [];
        for (let sId of uniqueSellerIds) {
          const sellerDoc = await getDoc(doc(db, 'users', sId));
          if (sellerDoc.exists()) {
            const sData = sellerDoc.data();
            if (sData.bankName && sData.bankNumber) {
              banks.push({ name: sData.name, bankName: sData.bankName, bankNumber: sData.bankNumber });
            }
          }
        }
        setSellerBanks(banks);
      };
      fetchSellerBanks();
    }, [method, cart]);

    const handleCheckout = async () => {
      if (!userProfile?.address) {
        showToast('Lengkapi alamat pengiriman di Profil Anda dulu!');
        return;
      }
      setIsCheckingOut(true);
      try {
        const newOrderRef = doc(collection(db, 'orders'));
        
        // Kurangi Stok Produk (Bug Fix: update stock)
        for (const item of cart) {
          const productRef = doc(db, 'products', item.id);
          const currentProduct = products.find(p => p.id === item.id);
          if (currentProduct) {
            await updateDoc(productRef, {
              stock: currentProduct.stock - item.qty,
              sold: (currentProduct.sold || 0) + item.qty
            });
          }
        }

        // Simpan Pesanan
        await setDoc(newOrderRef, {
          id: newOrderRef.id,
          createdAt: new Date().toISOString(),
          items: cart,
          total: total,
          status: 'Dikemas', 
          paymentMethod: method,
          courier: courier,
          buyerId: user.uid,
          buyerName: userProfile.name,
          address: userProfile.address,
          mapLink: userProfile.mapLink || '',
          sellerIds: [...new Set(cart.map(c => c.sellerId))]
        });

        setCart([]);
        showToast('Pesanan berhasil dibuat!');
        navigateTo('main', 'orders');
      } catch (e) {
        showToast('Gagal checkout: ' + e.message);
      }
      setIsCheckingOut(false);
    };

    return (
      <div className="flex flex-col h-screen bg-[#FFF8E1]">
        <div className="bg-[#4CAF50] p-4 flex items-center gap-3 shadow-sm sticky top-0 z-10 text-white rounded-b-2xl">
          <button onClick={() => navigateTo('main', 'cart')}><ChevronLeft size={24} /></button>
          <h1 className="font-bold text-lg">Checkout Pesanan</h1>
        </div>

        <div className="flex-1 overflow-y-auto pb-32">
          {/* Address Section */}
          <div className="bg-white p-5 mb-2 shadow-sm border-b border-[#8D6E63]/20">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-[#5D4037] flex items-center gap-2"><MapPin size={20} className="text-[#4CAF50]" /> Alamat Pengiriman</h3>
              <button onClick={() => navigateTo('main', 'profile')} className="text-xs text-[#4CAF50] font-bold">Ubah</button>
            </div>
            {userProfile?.address ? (
              <div className="bg-[#FFF8E1] p-4 rounded-xl border border-[#8D6E63]/30">
                <p className="text-sm font-bold text-[#5D4037] mb-1">{userProfile.name} <span className="text-[#8D6E63] font-medium ml-2">({userProfile.phone})</span></p>
                <p className="text-sm font-medium text-[#8D6E63] leading-relaxed mb-2">{userProfile.address}</p>
                {userProfile.mapLink && (
                  <a href={userProfile.mapLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded-md border border-blue-100">
                    <Map size={12}/> Lihat di Maps
                  </a>
                )}
              </div>
            ) : (
              <div className="bg-red-50 p-4 rounded-xl border border-red-200 flex flex-col gap-2">
                <p className="text-sm text-red-600 font-bold">Alamat belum diisi!</p>
                <button onClick={() => navigateTo('main', 'profile')} className="text-xs bg-red-600 text-white px-3 py-2 rounded-lg font-bold w-fit">Isi Alamat Sekarang</button>
              </div>
            )}
          </div>

          {/* Courier Section */}
          <div className="bg-white p-5 mb-2 shadow-sm border-y border-[#8D6E63]/20">
            <h3 className="font-bold text-[#5D4037] mb-4 text-lg flex items-center gap-2"><Truck size={20} className="text-[#8D6E63]" /> Pilihan Ekspedisi</h3>
            <div className="space-y-3">
              {['JNE', 'J&T', 'SiCepat'].map(c => (
                <label key={c} className={`flex items-center justify-between p-3 border-2 rounded-xl cursor-pointer transition shadow-sm ${courier === c ? 'border-[#4CAF50] bg-[#4CAF50]/10' : 'border-[#8D6E63]/20 bg-white hover:border-[#8D6E63]/50'}`}>
                  <div className="flex items-center gap-3">
                    <input type="radio" checked={courier === c} onChange={() => setCourier(c)} className="text-[#4CAF50] w-4 h-4 accent-[#4CAF50]" />
                    <span className={`text-sm font-bold ${courier === c ? 'text-[#388E3C]' : 'text-[#5D4037]'}`}>{c}</span>
                  </div>
                  <span className="text-xs font-bold text-[#8D6E63]">{formatRp(ongkirMap[c])}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Payment Section */}
          <div className="bg-white p-5 mb-2 shadow-sm border-y border-[#8D6E63]/20">
            <h3 className="font-bold text-[#5D4037] mb-4 text-lg flex items-center gap-2"><Banknote size={20} className="text-[#8D6E63]" /> Metode Pembayaran</h3>
            <div className="space-y-3">
              {['COD', 'Transfer Bank'].map(m => (
                <div key={m}>
                  <label className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition shadow-sm ${method === m ? 'border-[#4CAF50] bg-[#4CAF50]/10' : 'border-[#8D6E63]/20 bg-white hover:border-[#8D6E63]/50'}`}>
                    <input type="radio" checked={method === m} onChange={() => setMethod(m)} className="text-[#4CAF50] w-4 h-4 accent-[#4CAF50]" />
                    <span className={`text-sm font-bold ${method === m ? 'text-[#388E3C]' : 'text-[#5D4037]'}`}>{m === 'COD' ? 'Bayar di Tempat (COD)' : 'Transfer Bank'}</span>
                  </label>
                  
                  {method === 'Transfer Bank' && m === 'Transfer Bank' && (
                    <div className="mt-3 p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-900 shadow-inner">
                      <p className="font-bold mb-2">Silakan transfer ke Rekening Penjual:</p>
                      {sellerBanks.length > 0 ? (
                        sellerBanks.map((bank, idx) => (
                          <div key={idx} className="mb-2 bg-white p-2 rounded border border-blue-100">
                            <p className="text-xs text-blue-600 font-bold">{bank.name}</p>
                            <p className="font-bold text-lg">{bank.bankName} - {bank.bankNumber}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs italic text-blue-600/80">Menyiapkan data rekening penjual...</p>
                      )}
                      <p className="text-xs mt-2 opacity-80">* Lakukan pembayaran agar pesanan diproses.</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Summary Section */}
          <div className="bg-white p-5 shadow-sm border-t border-[#8D6E63]/20">
            <h3 className="font-bold text-[#5D4037] mb-4 text-lg">Rincian Belanja</h3>
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm font-medium text-[#8D6E63]"><span>Subtotal Pakan ({cart.length} barang)</span><span>{formatRp(subtotal)}</span></div>
              <div className="flex justify-between text-sm font-medium text-[#8D6E63]"><span>Ongkos Kirim ({courier})</span><span>{formatRp(ongkir)}</span></div>
            </div>
            <div className="flex justify-between font-bold text-[#5D4037] pt-4 border-t border-[#8D6E63]/20 text-lg">
              <span>Total Pembayaran</span><span className="text-[#4CAF50]">{formatRp(total)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white border-t border-[#8D6E63]/20 p-4 fixed bottom-0 w-full flex items-center justify-between shadow-[0_-8px_15px_-3px_rgba(0,0,0,0.05)] z-20">
          <div>
            <p className="text-xs font-medium text-[#8D6E63] mb-0.5">Total Bayar</p>
            <p className="text-xl font-bold text-[#4CAF50]">{formatRp(total)}</p>
          </div>
          <button disabled={isCheckingOut || !userProfile?.address} onClick={handleCheckout} className="bg-[#4CAF50] disabled:bg-gray-400 text-white px-8 py-3.5 rounded-xl font-bold shadow-md hover:bg-[#388E3C] transition flex items-center gap-2">
            {isCheckingOut ? 'Memproses...' : 'Buat Pesanan'}
          </button>
        </div>
      </div>
    );
  };

  const OrdersTab = () => {
    const isSeller = userProfile?.role === 'seller';
    
    // Filter pesanan sesuai role
    let filteredOrders = orders;
    if (isSeller) {
      filteredOrders = orders.filter(o => o.sellerIds && o.sellerIds.includes(user.uid));
    } else {
      filteredOrders = orders.filter(o => o.buyerId === user.uid);
    }

    const updateStatus = async (orderId, newStatus) => {
      try {
        await updateDoc(doc(db, 'orders', orderId), { status: newStatus });
        showToast(`Status diperbarui: ${newStatus}`);
      } catch (e) {
        showToast('Gagal update status: ' + e.message);
      }
    };

    return (
      <div className="flex flex-col h-screen bg-[#FFF8E1]">
        <div className="bg-[#4CAF50] text-white p-4 text-center font-bold text-lg shadow-sm sticky top-0 z-20 rounded-b-2xl">
          {isSeller ? 'Pesanan Masuk (Penjual)' : 'Riwayat Belanja'}
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-4">
          {filteredOrders.length === 0 ? (
            <div className="text-center text-[#8D6E63] mt-16 font-medium">Belum ada pesanan masuk.</div>
          ) : (
            filteredOrders.map(order => (
              <div key={order.id} className="bg-white rounded-2xl p-5 shadow-sm border border-[#8D6E63]/20">
                <div className="flex justify-between items-center mb-3 pb-3 border-b border-[#8D6E63]/20">
                  <div className="flex items-center gap-2">
                    <Store size={18} className="text-[#8D6E63]" />
                    <span className="font-bold text-sm text-[#5D4037]">{isSeller ? `Pembeli: ${order.buyerName}` : 'Detail Pesanan'}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md shadow-sm uppercase tracking-wide ${
                    order.status === 'Sampai' ? 'bg-[#4CAF50]/20 text-[#4CAF50] border border-[#4CAF50]/30' : 
                    order.status === 'Dikirim' ? 'bg-blue-100 text-blue-700 border border-blue-200' : 
                    'bg-yellow-100 text-yellow-700 border border-yellow-200'
                  }`}>
                    {order.status}
                  </span>
                </div>
                
                {order.items.filter(item => !isSeller || item.sellerId === user.uid).map((item, idx) => (
                  <div key={idx} className="flex gap-4 mb-3 last:mb-0">
                    <img src={item.image} alt={item.name} className="w-16 h-16 rounded-xl object-cover border border-[#FFF8E1]" />
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-[#5D4037] line-clamp-1 mb-1">{item.name}</h4>
                      <p className="text-xs font-medium text-[#8D6E63] mb-1">{item.qty} karung/pack x {formatRp(item.price)}</p>
                    </div>
                  </div>
                ))}
                
                <div className="bg-[#FFF8E1] p-3 rounded-xl mt-3 text-xs text-[#8D6E63]">
                  <p><span className="font-bold text-[#5D4037]">Ekspedisi:</span> {order.courier}</p>
                  <p><span className="font-bold text-[#5D4037]">Pembayaran:</span> {order.paymentMethod}</p>
                  {isSeller && (
                    <div className="mt-2 pt-2 border-t border-[#8D6E63]/20">
                      <p className="font-bold text-[#5D4037]">Alamat Pengiriman:</p>
                      <p className="mt-0.5">{order.address}</p>
                      {order.mapLink && (
                        <a href={order.mapLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-blue-600 font-bold bg-blue-100 px-2 py-1 rounded border border-blue-200 mt-1 hover:bg-blue-200">
                          <Map size={10}/> Buka di Maps
                        </a>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center pt-3 mt-3 border-t border-[#8D6E63]/20">
                  <p className="text-xs font-medium text-[#8D6E63]">Total Transaksi</p>
                  <p className="font-bold text-[#4CAF50] text-lg">{formatRp(order.total)}</p>
                </div>
                
                {/* SELLER ACTION: Dikemas -> Dikirim */}
                {isSeller && order.status === 'Dikemas' && (
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => updateStatus(order.id, 'Dikirim')} className="flex-1 bg-[#4CAF50] text-white py-2.5 rounded-xl text-sm font-bold shadow hover:bg-[#388E3C] transition">Tandai Sudah Dikirim</button>
                  </div>
                )}
                
                {/* BUYER ACTION: Dikirim -> Sampai */}
                {!isSeller && order.status === 'Dikirim' && (
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => updateStatus(order.id, 'Sampai')} className="flex-1 bg-[#4CAF50] text-white py-2.5 rounded-xl text-sm font-bold shadow hover:bg-[#388E3C] transition">Pesanan Diterima</button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const SellerDashboard = () => {
    const [isAdding, setIsAdding] = useState(false);
    const [editId, setEditId] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [formProd, setFormProd] = useState({ name: '', price: '', stock: '', category: 'Ayam', desc: '', image: '' });

    const myProducts = products.filter(p => p.sellerId === user.uid);

    const handleFileSelect = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      setIsUploading(true);
      const url = await uploadToSupabase(file);
      if (url) {
        setFormProd({ ...formProd, image: url });
      }
      setIsUploading(false);
    };

    const handleSubmitProduct = async (e) => {
      e.preventDefault();
      if(!formProd.image) {
        showToast('Wajib mengunggah foto pakan!');
        return;
      }
      try {
        const payload = {
          name: formProd.name,
          price: Number(formProd.price),
          stock: Number(formProd.stock),
          category: formProd.category,
          desc: formProd.desc,
          image: formProd.image,
          sellerId: user.uid,
          sellerName: userProfile.name,
          rating: formProd.rating || 0,
          sold: formProd.sold || 0
        };

        if (editId) {
          await updateDoc(doc(db, 'products', editId), payload);
          showToast('Produk diperbarui!');
        } else {
          await setDoc(doc(collection(db, 'products')), payload);
          showToast('Produk ditambahkan!');
        }
        setIsAdding(false);
        setEditId(null);
        setFormProd({ name: '', price: '', stock: '', category: 'Ayam', desc: '', image: '' });
      } catch (e) {
        showToast('Gagal menyimpan: ' + e.message);
      }
    };

    const handleDeleteProduct = async (id) => {
      if(confirm('Yakin ingin menghapus produk ini secara permanen?')) {
        await deleteDoc(doc(db, 'products', id));
        showToast('Produk dihapus!');
      }
    };

    const handleEdit = (prod) => {
      setFormProd({ ...prod });
      setEditId(prod.id);
      setIsAdding(true);
    };

    if (isAdding) {
      return (
        <div className="flex flex-col h-screen bg-[#FFF8E1] p-4 pb-24 overflow-y-auto">
          <div className="flex items-center mb-6">
            <button onClick={() => { setIsAdding(false); setEditId(null); }} className="text-[#8D6E63] p-2 bg-white rounded-full shadow"><ChevronLeft /></button>
            <h2 className="text-xl font-bold text-[#5D4037] ml-4">{editId ? 'Edit Pakan' : 'Tambah Pakan Baru'}</h2>
          </div>
          
          <form onSubmit={handleSubmitProduct} className="space-y-4 bg-white p-5 rounded-2xl shadow-sm border border-[#8D6E63]/20">
            {/* Supabase Image Upload Area */}
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-[#8D6E63]/30 rounded-xl p-4 bg-[#FFF8E1]/50 relative overflow-hidden">
              {formProd.image ? (
                <img src={formProd.image} alt="Preview" className="w-full h-32 object-contain" />
              ) : (
                <div className="text-center text-[#8D6E63]">
                  <Upload className="mx-auto mb-2 opacity-50" size={32}/>
                  <span className="text-xs font-bold">Upload Foto Pakan (Supabase)</span>
                </div>
              )}
              {isUploading && <div className="absolute inset-0 bg-white/80 flex items-center justify-center font-bold text-[#4CAF50]"><div className="w-5 h-5 border-2 border-[#4CAF50] border-t-transparent rounded-full animate-spin mr-2"></div> Uploading...</div>}
              <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileSelect} disabled={isUploading} />
            </div>

            <div>
              <label className="text-xs font-bold text-[#8D6E63] mb-1 block">Nama Pakan</label>
              <input required type="text" className="w-full border-b border-[#8D6E63]/30 py-2 focus:outline-none focus:border-[#4CAF50] text-[#5D4037]" value={formProd.name} onChange={e => setFormProd({...formProd, name: e.target.value})} />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs font-bold text-[#8D6E63] mb-1 block">Harga (Rp)</label>
                <input required type="number" className="w-full border-b border-[#8D6E63]/30 py-2 focus:outline-none focus:border-[#4CAF50] text-[#5D4037]" value={formProd.price} onChange={e => setFormProd({...formProd, price: e.target.value})} />
              </div>
              <div className="flex-1">
                <label className="text-xs font-bold text-[#8D6E63] mb-1 block">Stok Tersedia</label>
                <input required type="number" className="w-full border-b border-[#8D6E63]/30 py-2 focus:outline-none focus:border-[#4CAF50] text-[#5D4037]" value={formProd.stock} onChange={e => setFormProd({...formProd, stock: e.target.value})} />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-[#8D6E63] mb-1 block">Kategori Hewan</label>
              <select className="w-full border-b border-[#8D6E63]/30 py-2 focus:outline-none focus:border-[#4CAF50] text-[#5D4037]" value={formProd.category} onChange={e => setFormProd({...formProd, category: e.target.value})}>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[#8D6E63] mb-1 block">Deskripsi Lengkap</label>
              <textarea required rows="3" className="w-full border border-[#8D6E63]/30 rounded-xl p-3 focus:outline-none focus:border-[#4CAF50] text-[#5D4037] text-sm mt-1" value={formProd.desc} onChange={e => setFormProd({...formProd, desc: e.target.value})}></textarea>
            </div>
            <button disabled={isUploading} type="submit" className="w-full bg-[#4CAF50] disabled:bg-gray-400 text-white py-3.5 rounded-xl font-bold shadow-md hover:bg-[#388E3C] transition mt-2">Simpan Pakan</button>
          </form>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-screen bg-[#FFF8E1]">
        <div className="bg-[#4CAF50] text-white p-4 flex justify-between items-center shadow-sm sticky top-0 z-10 rounded-b-2xl">
          <h1 className="font-bold text-lg">Kelola Toko Saya</h1>
          <button onClick={() => setIsAdding(true)} className="bg-white text-[#4CAF50] px-3 py-1.5 rounded-full text-xs font-bold shadow flex items-center gap-1"><Plus size={14}/> Tambah</button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-4">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#8D6E63]/20 flex items-center gap-4">
            {userProfile?.photoProfile ? (
               <img src={userProfile.photoProfile} alt="Toko" className="w-12 h-12 rounded-full object-cover border border-[#4CAF50]" />
            ) : (
               <div className="w-12 h-12 bg-[#FFF8E1] rounded-full flex items-center justify-center text-[#8D6E63] border border-[#8D6E63]/30"><Store /></div>
            )}
            <div>
              <h3 className="font-bold text-[#5D4037]">{userProfile?.name}</h3>
              <p className="text-xs text-[#8D6E63]">{myProducts.length} Produk Pakan Aktif</p>
            </div>
          </div>

          <h3 className="font-bold text-[#5D4037] mt-6 mb-2">Daftar Pakan yang Dijual</h3>
          {myProducts.length === 0 ? (
            <p className="text-center text-[#8D6E63] mt-8 text-sm bg-white p-6 rounded-2xl border border-dashed border-[#8D6E63]/30">Belum ada produk jualan. Tambahkan pakan pertamamu sekarang!</p>
          ) : (
            myProducts.map(prod => (
              <div key={prod.id} className="bg-white p-4 rounded-2xl shadow-sm border border-[#8D6E63]/20 flex gap-4">
                 <img src={prod.image} alt={prod.name} className="w-20 h-20 rounded-xl object-cover border border-[#FFF8E1] bg-gray-50" />
                 <div className="flex-1">
                   <h4 className="text-sm font-bold text-[#5D4037] line-clamp-1">{prod.name}</h4>
                   <p className="text-[#4CAF50] font-bold text-sm mb-1">{formatRp(prod.price)}</p>
                   <p className="text-xs text-[#8D6E63] mb-2">Sisa Stok: <span className="font-bold">{prod.stock}</span></p>
                   <div className="flex gap-2">
                     <button onClick={() => handleEdit(prod)} className="flex-1 bg-[#FFF8E1] text-[#8D6E63] py-1.5 rounded-lg text-xs font-bold border border-[#8D6E63]/30 flex items-center justify-center gap-1"><Edit2 size={12}/> Edit</button>
                     <button onClick={() => handleDeleteProduct(prod.id)} className="bg-red-50 text-red-500 px-3 rounded-lg border border-red-100 flex items-center justify-center hover:bg-red-100"><Trash2 size={14}/></button>
                   </div>
                 </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const ProfileTab = () => {
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState({ 
      name: '', phone: '', address: '', mapLink: '', photoProfile: '', bankName: '', bankNumber: '' 
    });
    const [isUploading, setIsUploading] = useState(false);

    const startEdit = () => {
      setEditData({
        name: userProfile?.name || '',
        phone: userProfile?.phone || '',
        address: userProfile?.address || '',
        mapLink: userProfile?.mapLink || '',
        photoProfile: userProfile?.photoProfile || '',
        bankName: userProfile?.bankName || '',
        bankNumber: userProfile?.bankNumber || ''
      });
      setIsEditing(true);
    };

    const handleProfileUpload = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      setIsUploading(true);
      const url = await uploadToSupabase(file);
      if (url) {
        setEditData({ ...editData, photoProfile: url });
      }
      setIsUploading(false);
    };

    const saveProfile = async (e) => {
      e.preventDefault();
      try {
        await updateDoc(doc(db, 'users', user.uid), editData);
        showToast('Profil berhasil diperbarui!');
        setIsEditing(false);
      } catch (err) {
        showToast('Gagal update profil');
      }
    };

    if (isEditing) {
      return (
        <div className="flex flex-col h-screen bg-[#FFF8E1] p-6 pb-24 overflow-y-auto">
          <div className="flex items-center mb-6">
            <button onClick={() => setIsEditing(false)} className="text-[#8D6E63] p-2 bg-white rounded-full shadow"><ChevronLeft /></button>
            <h2 className="text-xl font-bold text-[#5D4037] ml-4">Pengaturan Profil</h2>
          </div>

          <form onSubmit={saveProfile} className="space-y-4 bg-white p-5 rounded-3xl shadow-sm border border-[#8D6E63]/20">
            {/* Foto Profil Supabase */}
            <div className="flex flex-col items-center mb-4 relative">
               <div className="w-24 h-24 bg-gray-100 rounded-full overflow-hidden border-4 border-[#4CAF50] relative">
                  {editData.photoProfile ? (
                    <img src={editData.photoProfile} alt="Profil" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon size={40} className="text-[#8D6E63] absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                  )}
                  {isUploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div></div>}
               </div>
               <label className="mt-2 text-xs text-[#4CAF50] font-bold cursor-pointer bg-[#4CAF50]/10 px-3 py-1.5 rounded-full border border-[#4CAF50]/30">
                  Ubah Foto Profil
                  <input type="file" accept="image/*" className="hidden" onChange={handleProfileUpload} disabled={isUploading} />
               </label>
            </div>

            <div>
              <label className="text-xs font-bold text-[#8D6E63] mb-1 block">Nama Lengkap / Toko</label>
              <input required type="text" className="w-full border-b border-[#8D6E63]/30 py-2 focus:outline-none focus:border-[#4CAF50] text-[#5D4037]" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} />
            </div>
            <div>
              <label className="text-xs font-bold text-[#8D6E63] mb-1 block">Nomor WhatsApp Aktif</label>
              <input required type="text" placeholder="08123456789" className="w-full border-b border-[#8D6E63]/30 py-2 focus:outline-none focus:border-[#4CAF50] text-[#5D4037]" value={editData.phone} onChange={e => setEditData({...editData, phone: e.target.value})} />
            </div>
            <div>
              <label className="text-xs font-bold text-[#8D6E63] mb-1 block">Alamat Lengkap</label>
              <textarea required rows="2" placeholder="Jl. Raya Peternak No.12..." className="w-full border border-[#8D6E63]/30 rounded-xl p-3 focus:outline-none focus:border-[#4CAF50] text-[#5D4037] text-sm mt-1" value={editData.address} onChange={e => setEditData({...editData, address: e.target.value})}></textarea>
            </div>
            <div>
              <label className="text-xs font-bold text-[#8D6E63] mb-1 block">Link Google Maps (Opsional)</label>
              <input type="url" placeholder="https://maps.app.goo.gl/..." className="w-full border-b border-[#8D6E63]/30 py-2 focus:outline-none focus:border-[#4CAF50] text-[#5D4037] text-sm" value={editData.mapLink} onChange={e => setEditData({...editData, mapLink: e.target.value})} />
            </div>

            {/* Khusus Penjual: Rekening Bank */}
            {userProfile?.role === 'seller' && (
              <div className="pt-4 border-t border-[#8D6E63]/20 mt-4">
                <h4 className="text-sm font-bold text-[#5D4037] mb-3 flex items-center gap-2"><Banknote size={16}/> Informasi Rekening Bank</h4>
                <div className="flex gap-3 mb-3">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-[#8D6E63] block mb-1">Pilih Bank</label>
                    <select className="w-full border-b border-[#8D6E63]/30 py-2 focus:outline-none focus:border-[#4CAF50] text-[#5D4037] text-sm" value={editData.bankName} onChange={e => setEditData({...editData, bankName: e.target.value})}>
                      <option value="">Pilih...</option>
                      <option value="BCA">BCA</option>
                      <option value="Mandiri">Mandiri</option>
                      <option value="BRI">BRI</option>
                      <option value="BNI">BNI</option>
                    </select>
                  </div>
                  <div className="flex-[2]">
                    <label className="text-[10px] font-bold text-[#8D6E63] block mb-1">Nomor Rekening</label>
                    <input type="number" placeholder="Contoh: 1234567890" className="w-full border-b border-[#8D6E63]/30 py-2 focus:outline-none focus:border-[#4CAF50] text-[#5D4037] text-sm" value={editData.bankNumber} onChange={e => setEditData({...editData, bankNumber: e.target.value})} />
                  </div>
                </div>
              </div>
            )}

            <button disabled={isUploading} type="submit" className="w-full bg-[#4CAF50] disabled:bg-gray-400 text-white py-3.5 rounded-xl font-bold shadow-md hover:bg-[#388E3C] transition mt-6">Simpan Perubahan</button>
          </form>
        </div>
      )
    }

    return (
      <div className="flex flex-col h-screen bg-[#FFF8E1] p-6 items-center pt-16 relative overflow-y-auto pb-24">
        <div className="w-28 h-28 bg-white rounded-full flex items-center justify-center shadow-lg border-4 border-[#4CAF50] mb-4 overflow-hidden relative group">
          {userProfile?.photoProfile ? (
            <img src={userProfile.photoProfile} alt="Profil" className="w-full h-full object-cover" />
          ) : (
            <UserIcon size={48} className="text-[#8D6E63]" />
          )}
        </div>
        <h2 className="text-2xl font-bold text-[#5D4037] mb-1">{userProfile?.name}</h2>
        <span className="bg-[#4CAF50]/10 text-[#4CAF50] px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest border border-[#4CAF50]/30 mb-6 shadow-sm">{userProfile?.role === 'seller' ? 'Penjual Pakan' : 'Pembeli Setia'}</span>
        
        <div className="w-full bg-white rounded-3xl p-5 shadow-sm border border-[#8D6E63]/20 mb-6 space-y-4">
          <div>
            <p className="text-[10px] uppercase font-bold text-[#8D6E63] mb-0.5">Email Akun</p>
            <p className="text-sm text-[#5D4037] font-medium">{userProfile?.email}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-[#8D6E63] mb-0.5">Telepon (WA)</p>
            <p className="text-sm text-[#5D4037] font-medium">{userProfile?.phone || <span className="text-red-400 italic">Belum diisi</span>}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-[#8D6E63] mb-0.5">Alamat Pengiriman/Toko</p>
            <p className="text-sm text-[#5D4037] font-medium leading-relaxed mb-1">{userProfile?.address || <span className="text-red-400 italic">Belum diisi</span>}</p>
            {userProfile?.mapLink && (
              <a href={userProfile.mapLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded border border-blue-100 hover:bg-blue-100 transition">
                <Map size={12}/> Lihat Titik Lokasi
              </a>
            )}
          </div>

          {userProfile?.role === 'seller' && (
            <div className="pt-3 border-t border-[#8D6E63]/20">
               <p className="text-[10px] uppercase font-bold text-[#8D6E63] mb-0.5">Rekening Bank Penjualan</p>
               <p className="text-sm text-[#5D4037] font-medium">
                  {userProfile?.bankName && userProfile?.bankNumber ? `${userProfile.bankName} - ${userProfile.bankNumber}` : <span className="text-red-400 italic">Data bank belum diisi</span>}
               </p>
            </div>
          )}

          <button onClick={startEdit} className="w-full mt-4 bg-[#FFF8E1] text-[#8D6E63] border border-[#8D6E63]/30 py-3 rounded-xl font-bold text-sm shadow-inner hover:bg-[#8D6E63]/10 transition flex items-center justify-center gap-2">
            <Edit2 size={16}/> Edit Profil Lengkap
          </button>
        </div>
        
        <button onClick={() => signOut(auth)} className="w-full max-w-xs bg-white border border-red-200 text-red-500 py-3.5 rounded-2xl font-bold shadow-sm hover:bg-red-50 hover:text-red-600 transition flex items-center justify-center gap-2">
          <LogOut size={18}/> Keluar Aplikasi
        </button>
      </div>
    );
  };

  // --- MAIN RENDER ---
  return (
    <div className="w-full max-w-md mx-auto h-screen relative bg-[#FFF8E1] overflow-hidden shadow-2xl flex flex-col font-sans">
      {/* Toast Notification */}
      {toast && (
        <div className="absolute top-10 left-1/2 transform -translate-x-1/2 bg-[#5D4037] text-white px-5 py-2.5 rounded-full text-sm font-bold shadow-2xl z-[100] flex items-center gap-2 whitespace-nowrap animate-in fade-in slide-in-from-top-4 duration-300">
           <Check size={16} className="text-[#4CAF50]"/> {toast}
        </div>
      )}

      {/* View Routing Area */}
      <div className="flex-1 overflow-hidden relative">
        {activeView === 'auth' && <AuthView />}
        {activeView === 'main' && activeTab === 'home' && <BuyerHomeTab />}
        {activeView === 'main' && activeTab === 'dashboard' && <SellerDashboard />}
        {activeView === 'main' && activeTab === 'cart' && <CartTab />}
        {activeView === 'main' && activeTab === 'orders' && <OrdersTab />}
        {activeView === 'main' && activeTab === 'profile' && <ProfileTab />}
        {activeView === 'product' && <ProductDetailView />}
        {activeView === 'checkout' && <CheckoutView />}
      </div>

      {/* BOTTOM NAVIGATION (Hanya tampil di main views) */}
      {activeView === 'main' && (
        <div className="bg-white border-t border-[#8D6E63]/20 flex justify-around p-2 pb-4 shadow-[0_-5px_20px_-5px_rgba(0,0,0,0.1)] z-40 rounded-t-3xl">
          {userProfile?.role === 'buyer' ? (
            <>
              <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center p-2 transition-all ${activeTab === 'home' ? 'text-[#4CAF50] -translate-y-1' : 'text-[#8D6E63]'}`}>
                <Home size={24} className={activeTab==='home'?'fill-[#4CAF50]/20':''} />
                <span className="text-[10px] font-bold mt-1">Beranda</span>
              </button>
              <button onClick={() => setActiveTab('cart')} className={`flex flex-col items-center p-2 relative transition-all ${activeTab === 'cart' ? 'text-[#4CAF50] -translate-y-1' : 'text-[#8D6E63]'}`}>
                <ShoppingCart size={24} className={activeTab==='cart'?'fill-[#4CAF50]/20':''} />
                {cart.length > 0 && <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full font-bold">{cart.length}</span>}
                <span className="text-[10px] font-bold mt-1">Keranjang</span>
              </button>
              <button onClick={() => setActiveTab('orders')} className={`flex flex-col items-center p-2 transition-all ${activeTab === 'orders' ? 'text-[#4CAF50] -translate-y-1' : 'text-[#8D6E63]'}`}>
                <Package size={24} className={activeTab==='orders'?'fill-[#4CAF50]/20':''} />
                <span className="text-[10px] font-bold mt-1">Pesanan</span>
              </button>
              <button onClick={() => setActiveTab('profile')} className={`flex flex-col items-center p-2 transition-all ${activeTab === 'profile' ? 'text-[#4CAF50] -translate-y-1' : 'text-[#8D6E63]'}`}>
                <UserIcon size={24} className={activeTab==='profile'?'fill-[#4CAF50]/20':''} />
                <span className="text-[10px] font-bold mt-1">Profil</span>
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center p-2 transition-all ${activeTab === 'dashboard' ? 'text-[#4CAF50] -translate-y-1' : 'text-[#8D6E63]'}`}>
                <Store size={24} className={activeTab==='dashboard'?'fill-[#4CAF50]/20':''} />
                <span className="text-[10px] font-bold mt-1">Kelola Toko</span>
              </button>
              <button onClick={() => setActiveTab('orders')} className={`flex flex-col items-center p-2 transition-all ${activeTab === 'orders' ? 'text-[#4CAF50] -translate-y-1' : 'text-[#8D6E63]'}`}>
                <Package size={24} className={activeTab==='orders'?'fill-[#4CAF50]/20':''} />
                <span className="text-[10px] font-bold mt-1">Pesanan</span>
              </button>
              <button onClick={() => setActiveTab('profile')} className={`flex flex-col items-center p-2 transition-all ${activeTab === 'profile' ? 'text-[#4CAF50] -translate-y-1' : 'text-[#8D6E63]'}`}>
                <UserIcon size={24} className={activeTab==='profile'?'fill-[#4CAF50]/20':''} />
                <span className="text-[10px] font-bold mt-1">Profil</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
