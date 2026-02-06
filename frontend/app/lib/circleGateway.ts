const GATEWAY_API_BASE = 'https://gateway-api-testnet.circle.com/v1';

export interface GatewayBalance {
  domain: number;
  balance: string;
}

export interface GatewayBalanceResponse {
  balances: GatewayBalance[];
}

// Check unified Gateway balance across all chains
export async function getGatewayBalances(
  depositorAddress: string
): Promise<GatewayBalanceResponse> {
  const domains = [26, 6]; // Arc and Base domains
  
  const response = await fetch(`${GATEWAY_API_BASE}/balances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: 'USDC',
      sources: domains.map(domain => ({
        domain,
        depositor: depositorAddress,
      })),
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch Gateway balances');
  }

  return response.json();
}

// Helper to parse Gateway balance by domain
export function parseGatewayBalances(response: GatewayBalanceResponse) {
  const balances = {
    arc: '0',
    base: '0',
    total: '0',
  };

  let total = 0;
  
  response.balances.forEach(b => {
    const amount = parseFloat(b.balance);
    total += amount;
    
    if (b.domain === 26) balances.arc = b.balance;
    if (b.domain === 6) balances.base = b.balance;
  });

  balances.total = total.toFixed(6);
  
  return balances;
}