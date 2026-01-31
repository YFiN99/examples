import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { ArrowDown, RefreshCw, Plus, Twitter, Github, Wallet, Coins, LogOut, X } from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';

// ==========================================
// KONFIGURASI ALAMAT KONTRAK
// ==========================================
const ROUTER_ADDRESS = "0x48c9242E189BE8b194BCc195a7632211022A95EC";
const WETH_ADDRESS = "0x838800b758277CC111B2d48Ab01e5E164f8E9471"; 
const STAKING_ADDRESS = "0xa21e13E60fBE1a2CB5f47392E5645DcA42263116";
const LST_TOKEN_ADDRESS = "0xb049FD87d476E0fC3F12bC4E313be89298254C50";

const ROUTER_ABI = [
  "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  "function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)"
];

const STAKING_ABI = [
  "function stake(uint256 amount) external",
  "function withdraw(uint256 amount) external",
  "function claimReward() external",
  "function earned(address account) public view returns (uint256)",
  "function balanceOf(address account) public view returns (uint256)",
  "function exit() external"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)", 
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)"
];

export default function App() {
  const [tab, setTab] = useState('swap');
  const [account, setAccount] = useState('');
  const [loading, setLoading] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [stakedBalance, setStakedBalance] = useState('0');
  const [pendingReward, setPendingReward] = useState('0');
  const [balanceA, setBalanceA] = useState('0');
  const [balanceB, setBalanceB] = useState('0');
  const [provider, setProvider] = useState(null);
  const [router, setRouter] = useState(null);

  const tokens = [
    { name: "Pharos", symbol: "PHRS", address: WETH_ADDRESS, isNative: true },
    { name: "Liquid Staking", symbol: "LST", address: LST_TOKEN_ADDRESS, isNative: false }
  ];

  const [tokenA, setTokenA] = useState(tokens[0]);
  const [tokenB, setTokenB] = useState(tokens[1]);

  useEffect(() => {
    if (account && provider) {
      fetchBalances();
      fetchStakingData();
      const interval = setInterval(() => {
        fetchBalances();
        fetchStakingData();
      }, 3000); 
      return () => clearInterval(interval);
    }
  }, [account, provider, tab, tokenA, tokenB]);

  const fetchBalances = async () => {
    try {
      const balA = tokenA.isNative ? await provider.getBalance(account) : await (new ethers.Contract(tokenA.address, ERC20_ABI, provider)).balanceOf(account);
      const balB = tokenB.isNative ? await provider.getBalance(account) : await (new ethers.Contract(tokenB.address, ERC20_ABI, provider)).balanceOf(account);
      setBalanceA(ethers.formatEther(balA));
      setBalanceB(ethers.formatEther(balB));
    } catch (e) { console.error("Fetch Balance Error:", e); }
  };

  const fetchStakingData = async () => {
    try {
      const staking = new ethers.Contract(STAKING_ADDRESS, STAKING_ABI, provider);
      const [staked, earned] = await Promise.all([
        staking.balanceOf(account).catch(() => 0n),
        staking.earned(account).catch(() => 0n)
      ]);
      setStakedBalance(ethers.formatEther(staked));
      setPendingReward(ethers.formatEther(earned));
    } catch (e) { console.error("Fetch Staking Error:", e); }
  };

  useEffect(() => {
    const getPrice = async () => {
      if (!amountA || amountA === "." || parseFloat(amountA) <= 0 || !router || tokenA.address === tokenB.address) {
        if (tab === 'swap') setAmountB('');
        return;
      }
      try {
        const path = [tokenA.isNative ? WETH_ADDRESS : tokenA.address, tokenB.isNative ? WETH_ADDRESS : tokenB.address];
        const amountIn = ethers.parseEther(amountA);
        const amounts = await router.getAmountsOut(amountIn, path);
        setAmountB(ethers.formatEther(amounts[1]));
      } catch (e) {
        if (tab === 'swap') setAmountB("No Pool");
      }
    };
    const delayDebounce = setTimeout(getPrice, 600);
    return () => clearTimeout(delayDebounce);
  }, [amountA, tokenA, tokenB, tab, router]);

  const connectWallet = async (walletType) => {
    let ethProvider;
    if (walletType === 'metamask') {
        ethProvider = window.ethereum?.providers?.find(p => p.isMetaMask) || (window.ethereum?.isMetaMask ? window.ethereum : null);
    } else if (walletType === 'okx') {
        ethProvider = window.okxwallet;
    }

    if (!ethProvider) return toast.error(`${walletType} tidak ditemukan!`);

    try {
      const accounts = await ethProvider.request({ method: 'eth_requestAccounts' });
      const prov = new ethers.BrowserProvider(ethProvider);
      const signer = await prov.getSigner();
      setAccount(accounts[0]);
      setProvider(prov);
      setRouter(new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer));
      setShowWalletModal(false);
      toast.success(`${walletType.toUpperCase()} Connected!`);
    } catch (e) { toast.error("Koneksi gagal"); }
  };

  const handleStakingAction = async (actionType) => {
    if (!account) return setShowWalletModal(true);
    setLoading(true);
    const tid = toast.loading(`${actionType === 'stake' ? 'Staking' : 'Unstaking'}...`);
    try {
      const sig = await provider.getSigner();
      const staking = new ethers.Contract(STAKING_ADDRESS, STAKING_ABI, sig);
      const val = ethers.parseEther(amountA);

      if (actionType === 'stake') {
        const lst = new ethers.Contract(LST_TOKEN_ADDRESS, ERC20_ABI, sig);
        const allowance = await lst.allowance(account, STAKING_ADDRESS);
        if (allowance < val) {
          await (await lst.approve(STAKING_ADDRESS, ethers.MaxUint256)).wait();
        }
        await (await staking.stake(val, { gasLimit: 300000 })).wait();
      } else {
        await (await staking.withdraw(val, { gasLimit: 300000 })).wait();
      }
      toast.success("Berhasil!", { id: tid });
      setAmountA(''); fetchBalances(); fetchStakingData();
    } catch (e) { 
      console.error(e);
      toast.error("Gagal: " + (e.reason || "Cek Saldo/Gas"), { id: tid }); 
    }
    setLoading(false);
  };

  const handleAction = async (forcedTab) => {
    const activeTab = forcedTab || tab;
    if (!account) return setShowWalletModal(true);
    setLoading(true);
    const tid = toast.loading("Processing...");
    
    try {
      const sig = await provider.getSigner();
      const deadline = Math.floor(Date.now() / 1000) + 1200;

      if (activeTab === 'swap') {
        const valA = ethers.parseEther(amountA || "0");
        const path = [tokenA.isNative ? WETH_ADDRESS : tokenA.address, tokenB.isNative ? WETH_ADDRESS : tokenB.address];
        if (!tokenA.isNative) {
          const tkn = new ethers.Contract(tokenA.address, ERC20_ABI, sig);
          if (await tkn.allowance(account, ROUTER_ADDRESS) < valA) {
            await (await tkn.approve(ROUTER_ADDRESS, ethers.MaxUint256)).wait();
          }
          await (await router.swapExactTokensForETH(valA, 0, path, account, deadline, { gasLimit: 300000 })).wait();
        } else {
          await (await router.swapExactETHForTokens(0, path, account, deadline, { value: valA, gasLimit: 300000 })).wait();
        }
      } else if (activeTab === 'liquidity') {
        const valA = ethers.parseEther(amountA || "0");
        const valB = ethers.parseEther(amountB || "0");
        const tokenAddr = tokenA.isNative ? tokenB.address : tokenA.address;
        const tkn = new ethers.Contract(tokenAddr, ERC20_ABI, sig);
        if (await tkn.allowance(account, ROUTER_ADDRESS) < (tokenA.isNative ? valB : valA)) {
          await (await tkn.approve(ROUTER_ADDRESS, ethers.MaxUint256)).wait();
        }
        await (await router.addLiquidityETH(tokenAddr, tokenA.isNative ? valB : valA, 0, 0, account, deadline, { value: tokenA.isNative ? valA : valB, gasLimit: 500000 })).wait();
      } else if (activeTab === 'claim') {
        const staking = new ethers.Contract(STAKING_ADDRESS, STAKING_ABI, sig);
        await (await staking.claimReward({ gasLimit: 250000 })).wait();
      }

      toast.success("Transaction Confirmed!", { id: tid });
      setAmountA(''); setAmountB(''); fetchBalances(); fetchStakingData();
    } catch (e) { 
      console.error(e);
      toast.error(e.reason || "Transaction Failed", { id: tid }); 
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#050c0a] text-emerald-500 flex flex-col items-center justify-center p-4 font-sans">
      <div className="z-10 w-full max-w-[550px] space-y-4">
        
        {/* HEADER */}
        <div className="flex justify-between items-center px-4">
          <div className="flex items-center gap-3">
             <div className="w-11 h-11 bg-white rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                <span className="text-black font-black text-2xl tracking-tighter">P</span>
             </div>
             <div className="flex flex-col">
               <h1 className="font-black uppercase tracking-[0.2em] text-xl text-white leading-none">Pharos <span className="text-emerald-500">Finance</span></h1>
               <span className="text-[8px] text-emerald-900 font-bold uppercase tracking-[0.3em] mt-1">Deep-Parallel L1 Network</span>
             </div>
          </div>
          {account ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-2xl flex items-center gap-2 text-xs font-mono">
               <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
               {account.slice(0,6)}...{account.slice(-4)}
            </div>
          ) : (
            <button onClick={() => setShowWalletModal(true)} className="bg-white text-black px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-emerald-500 transition-all">Connect Wallet</button>
          )}
        </div>

        {/* MAIN CARD */}
        <div className="bg-[#0a1814]/90 backdrop-blur-2xl border border-emerald-500/10 rounded-[40px] p-10 shadow-2xl relative overflow-hidden">
          <div className="flex bg-black/40 p-1.5 rounded-[22px] mb-8 border border-emerald-900/20 relative z-10">
            {['swap', 'liquidity', 'stake'].map((t) => (
              <button key={t} onClick={() => {setTab(t); setAmountA(''); setAmountB('');}} className={`flex-1 py-4 rounded-[18px] text-xs font-black uppercase tracking-[0.15em] transition-all ${tab === t ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-emerald-900 hover:text-emerald-700'}`}>
                {t}
              </button>
            ))}
          </div>

          {tab === 'stake' ? (
            <div className="space-y-4 relative z-10">
               <div className="bg-black/40 border border-emerald-500/10 p-6 rounded-[28px]">
                  <div className="flex justify-between mb-4">
                    <span className="text-xs font-black text-emerald-900 uppercase">Amount</span>
                    <span className="text-xs font-bold text-emerald-400/40">Bal: {parseFloat(balanceB).toFixed(2)} LST</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <input type="number" value={amountA} onChange={(e)=>setAmountA(e.target.value)} placeholder="0.0" className="bg-transparent text-5xl font-bold w-full outline-none placeholder:text-emerald-950" />
                    <div className="bg-emerald-500/10 px-6 py-3 rounded-2xl text-sm font-black flex items-center gap-2"><Coins size={18}/> LST</div>
                  </div>
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <button onClick={() => handleStakingAction('stake')} disabled={loading || !amountA} className="bg-emerald-500 hover:bg-emerald-400 text-black h-16 rounded-2xl font-black text-sm tracking-widest transition-all disabled:opacity-20">STAKE</button>
                 <button onClick={() => handleStakingAction('withdraw')} disabled={loading || !amountA} className="bg-transparent border-2 border-emerald-500/30 hover:border-emerald-500 text-emerald-500 h-16 rounded-2xl font-black text-sm tracking-widest transition-all disabled:opacity-20 text-xs uppercase">Unstake</button>
               </div>
               <div className="bg-emerald-500/5 border border-emerald-500/10 p-6 rounded-[28px] flex justify-between items-center mt-4">
                 <div>
                   <p className="text-[10px] font-black text-emerald-900 uppercase">Staked Balance</p>
                   <p className="text-2xl font-bold text-emerald-100">{parseFloat(stakedBalance).toFixed(2)} <span className="text-xs text-emerald-500">LST</span></p>
                   <p className="text-[10px] font-bold text-emerald-500/50">Rewards: {parseFloat(pendingReward).toFixed(6)} PHRS</p>
                 </div>
                 <button 
                  onClick={() => handleAction('claim')} 
                  disabled={loading || parseFloat(pendingReward) <= 0} 
                  className="bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 px-6 py-3 rounded-xl text-xs font-black uppercase disabled:opacity-20"
                 >
                    Claim
                 </button>
               </div>
            </div>
          ) : (
            <div className="space-y-2 relative z-10">
              <div className="bg-black/40 border border-emerald-500/10 p-8 rounded-[32px]">
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-black text-emerald-900 uppercase">{tab === 'swap' ? 'Pay' : 'Input A'}</span>
                  <span className="text-xs font-bold text-emerald-400/40">Bal: {parseFloat(balanceA).toFixed(4)}</span>
                </div>
                <div className="flex items-center gap-4">
                  <input type="number" value={amountA} onChange={(e)=>setAmountA(e.target.value)} placeholder="0.0" className="bg-transparent text-5xl font-bold w-full outline-none" />
                  <select value={tokenA.address} onChange={(e)=>setTokenA(tokens.find(t=>t.address===e.target.value))} className="bg-emerald-500/10 border-none rounded-xl text-sm font-black p-3 outline-none">
                    {tokens.map(t => <option key={t.address} value={t.address} className="bg-[#0a1814]">{t.symbol}</option>)}
                  </select>
                </div>
              </div>
              <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                <div onClick={()=>{setTokenA(tokenB); setTokenB(tokenA);}} className="w-14 h-14 bg-[#050c0a] border-2 border-emerald-500 rounded-2xl flex items-center justify-center text-emerald-500 shadow-xl rotate-45 hover:rotate-0 transition-all cursor-pointer">
                    <div className="-rotate-45">{tab === 'swap' ? <ArrowDown size={24}/> : <Plus size={24}/>}</div>
                </div>
              </div>
              <div className="bg-black/40 border border-emerald-500/10 p-8 rounded-[32px] pt-14">
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-black text-emerald-900 uppercase">{tab === 'swap' ? 'Receive' : 'Input B'}</span>
                  <span className="text-xs font-bold text-emerald-400/40">Bal: {parseFloat(balanceB).toFixed(4)}</span>
                </div>
                <div className="flex items-center gap-4">
                  <input type="number" value={amountB} onChange={(e)=>setAmountB(e.target.value)} readOnly={tab==='swap'} placeholder="0.0" className="bg-transparent text-5xl font-bold w-full outline-none text-emerald-100" />
                  <select value={tokenB.address} onChange={(e)=>setTokenB(tokens.find(t=>t.address===e.target.value))} className="bg-emerald-500/10 border-none rounded-xl text-sm font-black p-3 outline-none">
                    {tokens.map(t => <option key={t.address} value={t.address} className="bg-[#0a1814]">{t.symbol}</option>)}
                  </select>
                </div>
              </div>
              <button disabled={loading || !amountA} onClick={() => handleAction()} className="w-full h-24 mt-8 bg-emerald-500 hover:bg-emerald-400 text-black rounded-[28px] font-black text-xl tracking-[0.2em] transition-all disabled:opacity-30">
                {loading ? <RefreshCw className="animate-spin mx-auto" /> : (tab === 'swap' ? 'SWAP NOW' : 'ADD LIQUIDITY')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* WALLET SELECTION MODAL */}
      {showWalletModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowWalletModal(false)} />
          <div className="relative bg-[#0a1814] border border-emerald-500/20 w-full max-w-[400px] rounded-[32px] p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black text-emerald-400 italic uppercase tracking-wider">Connect Wallet</h2>
                <button onClick={() => setShowWalletModal(false)} className="text-emerald-900 hover:text-emerald-500"><X size={24}/></button>
            </div>
            <div className="space-y-4">
              <button onClick={() => connectWallet('metamask')} className="w-full bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 hover:border-emerald-500/40 p-5 rounded-[24px] flex items-center gap-4 transition-all">
                <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Mirror_Logo.svg" className="w-8 h-8" alt="MM" />
                <span className="font-bold text-emerald-100 uppercase italic">MetaMask</span>
              </button>
              <button onClick={() => connectWallet('okx')} className="w-full bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 hover:border-emerald-500/40 p-5 rounded-[24px] flex items-center gap-4 transition-all">
                <img src="https://www.okx.com/cdn/assets/imgs/221/96263B7F9803C1B4.png" className="w-8 h-8" alt="OKX" />
                <span className="font-bold text-emerald-100 uppercase italic">OKX Wallet</span>
              </button>
            </div>
          </div>
        </div>
      )}
      <Toaster position="bottom-center" />
    </div>
  );
}