// Kelvara testnet contracts · concept project by Numinae.
// TESTNET ONLY. These exist to demonstrate a pay-then-claim flow. They are not audited
// and must never hold anything of value.
//
//   TestUsdt     a faucet token ("tUSDT"): anyone can mint a capped amount to themselves
//   KelvaraSale  the KVRA token master and the presale in one: it records a KVRA allocation
//                when it receives tUSDT, and mints that allocation when the buyer claims
//   JettonWallet the standard per-holder token wallet, shared by both tokens

message(0xf8a7ea5) JettonTransfer {
    queryId: Int as uint64;
    amount: Int as coins;
    destination: Address;
    responseDestination: Address?;
    customPayload: Cell?;
    forwardTonAmount: Int as coins;
    forwardPayload: Slice as remaining;
}

message(0x178d4519) JettonInternalTransfer {
    queryId: Int as uint64;
    amount: Int as coins;
    from: Address;
    responseDestination: Address?;
    forwardTonAmount: Int as coins;
    forwardPayload: Slice as remaining;
}

message(0x7362d09c) JettonNotification {
    queryId: Int as uint64;
    amount: Int as coins;
    from: Address;
    forwardPayload: Slice as remaining;
}

message(0xd53276db) JettonExcesses {
    queryId: Int as uint64;
}

message(0x4b560001) FaucetMint {
    amount: Int as coins;
}

message(0x4b560002) Claim {
    queryId: Int as uint64;
}

struct JettonData {
    totalSupply: Int;
    mintable: Bool;
    admin: Address;
    content: Cell;
    walletCode: Cell;
}

struct WalletData {
    balance: Int;
    owner: Address;
    master: Address;
    walletCode: Cell;
}

const MinStorage: Int = ton("0.01");
const GasReserve: Int = ton("0.012");

contract JettonWallet {
    balance: Int as coins = 0;
    owner: Address;
    master: Address;

    init(owner: Address, master: Address) {
        self.owner = owner;
        self.master = master;
    }

    receive(msg: JettonTransfer) {
        let ctx: Context = context();
        require(ctx.sender == self.owner, "Only the owner can send");
        require(msg.amount > 0, "Amount must be positive");
        require(self.balance >= msg.amount, "Not enough tokens");
        self.balance -= msg.amount;
        let init: StateInit = initOf JettonWallet(msg.destination, self.master);
        send(SendParameters{
            to: contractAddress(init),
            value: 0,
            mode: SendRemainingValue,
            bounce: true,
            body: JettonInternalTransfer{
                queryId: msg.queryId,
                amount: msg.amount,
                from: self.owner,
                responseDestination: msg.responseDestination,
                forwardTonAmount: msg.forwardTonAmount,
                forwardPayload: msg.forwardPayload
            }.toCell(),
            code: init.code,
            data: init.data
        });
    }

    receive(msg: JettonInternalTransfer) {
        let ctx: Context = context();
        if (ctx.sender != self.master) {
            let init: StateInit = initOf JettonWallet(msg.from, self.master);
            require(contractAddress(init) == ctx.sender, "Unknown sender");
        }
        self.balance += msg.amount;

        // keep enough for storage and this message's gas, pass the rest on
        let before: Int = myBalance() - ctx.value;
        let keep: Int = MinStorage - min(before, MinStorage);
        let left: Int = ctx.value - keep - GasReserve;
        if (msg.forwardTonAmount > 0) {
            left = left - msg.forwardTonAmount - ctx.readForwardFee();
            send(SendParameters{
                to: self.owner,
                value: msg.forwardTonAmount,
                mode: SendPayGasSeparately,
                bounce: false,
                body: JettonNotification{
                    queryId: msg.queryId,
                    amount: msg.amount,
                    from: msg.from,
                    forwardPayload: msg.forwardPayload
                }.toCell()
            });
        }
        if (msg.responseDestination != null && left > 0) {
            send(SendParameters{
                to: msg.responseDestination!!,
                value: left,
                mode: SendIgnoreErrors,
                bounce: false,
                body: JettonExcesses{queryId: msg.queryId}.toCell()
            });
        }
    }

    bounced(msg: bounced<JettonInternalTransfer>) {
        self.balance += msg.amount;
    }

    get fun get_wallet_data(): WalletData {
        return WalletData{
            balance: self.balance,
            owner: self.owner,
            master: self.master,
            walletCode: (initOf JettonWallet(self.owner, self.master)).code
        };
    }
}

contract TestUsdt {
    totalSupply: Int as coins = 0;
    content: Cell;
    cap: Int as coins;

    init(content: Cell, cap: Int) {
        self.content = content;
        self.cap = cap;
    }

    // deploy / top up
    receive() {}

    receive(msg: FaucetMint) {
        require(msg.amount > 0, "Amount must be positive");
        require(msg.amount <= self.cap, "Over the faucet limit");
        self.totalSupply += msg.amount;
        let init: StateInit = initOf JettonWallet(sender(), myAddress());
        send(SendParameters{
            to: contractAddress(init),
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: JettonInternalTransfer{
                queryId: 0,
                amount: msg.amount,
                from: myAddress(),
                responseDestination: sender(),
                forwardTonAmount: 0,
                forwardPayload: emptySlice()
            }.toCell(),
            code: init.code,
            data: init.data
        });
    }

    get fun get_jetton_data(): JettonData {
        return JettonData{
            totalSupply: self.totalSupply,
            mintable: true,
            admin: myAddress(),
            content: self.content,
            walletCode: (initOf JettonWallet(myAddress(), myAddress())).code
        };
    }

    get fun get_wallet_address(owner: Address): Address {
        return contractAddress(initOf JettonWallet(owner, myAddress()));
    }
}

contract KelvaraSale {
    totalSupply: Int as coins = 0;
    raised: Int as coins = 0;
    content: Cell;
    usdtMaster: Address;
    // KVRA base units per tUSDT base unit: 1 KVRA (9 decimals) costs 0.08 tUSDT (6 decimals)
    rate: Int as uint32;
    allocations: map<Address, Int as coins>;

    init(content: Cell, usdtMaster: Address, rate: Int) {
        self.content = content;
        self.usdtMaster = usdtMaster;
        self.rate = rate;
    }

    // deploy / top up
    receive() {}

    // tUSDT arrived: record the buyer's KVRA allocation
    receive(msg: JettonNotification) {
        let usdtWallet: Address = contractAddress(initOf JettonWallet(myAddress(), self.usdtMaster));
        require(sender() == usdtWallet, "Only test USDT is accepted");
        let prev: Int? = self.allocations.get(msg.from);
        let add: Int = msg.amount * self.rate;
        if (prev == null) {
            self.allocations.set(msg.from, add);
        } else {
            self.allocations.set(msg.from, prev!! + add);
        }
        self.raised += msg.amount;
    }

    // the buyer claims: mint the recorded allocation to them
    receive(msg: Claim) {
        let who: Address = sender();
        let amount: Int? = self.allocations.get(who);
        require(amount != null, "Nothing to claim");
        require(amount!! > 0, "Nothing to claim");
        self.allocations.set(who, null);
        self.totalSupply += amount!!;
        let init: StateInit = initOf JettonWallet(who, myAddress());
        send(SendParameters{
            to: contractAddress(init),
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: JettonInternalTransfer{
                queryId: msg.queryId,
                amount: amount!!,
                from: myAddress(),
                responseDestination: who,
                forwardTonAmount: 0,
                forwardPayload: emptySlice()
            }.toCell(),
            code: init.code,
            data: init.data
        });
    }

    get fun allocation(owner: Address): Int {
        let a: Int? = self.allocations.get(owner);
        if (a == null) {
            return 0;
        }
        return a!!;
    }

    get fun raised(): Int {
        return self.raised;
    }

    get fun get_jetton_data(): JettonData {
        return JettonData{
            totalSupply: self.totalSupply,
            mintable: true,
            admin: myAddress(),
            content: self.content,
            walletCode: (initOf JettonWallet(myAddress(), myAddress())).code
        };
    }

    get fun get_wallet_address(owner: Address): Address {
        return contractAddress(initOf JettonWallet(owner, myAddress()));
    }
}
