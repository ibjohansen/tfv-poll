import 'server-only';
import { getAccountingOverview } from './accounting.js';
import { accountingCategories, accountingReference2025 } from '../data/accounting.js';
import { accountingSummary, accountingYear } from './accounting-validation.js';

const names={dues:'Årskontingent',fees:'Ekspedisjonsgebyrer',reminders:'Påminnelsesavgift',board:'Styrehonorar',systems:'Systemer og programvare',accountant:'Regnskapsfører',trailer:'Tilhenger',other:'Andre kostnader',bank:'Bankkostnader'};
// Exports preserve the existing manual financial model and the historical balance.
export async function getAccountingReport(value){
 const year=accountingYear(value),[current,next]=await Promise.all([getAccountingOverview(year),getAccountingOverview(year+1)]);
 const summary=accountingSummary(current.settings,current.expenses);
 const actual=year===2025?accountingReference2025.actual:summary.actual;
 const result=accountingCategories.map(a=>({code:a.code||'–',name:names[a.id],kind:a.kind,actual_ore:actual[a.id]??null,budget_ore:next.settings.budget[a.id]||0}));
 const complete=result.filter(a=>a.kind==='income').every(a=>a.actual_ore!==null);
 const sum=kind=>result.filter(a=>a.kind===kind).reduce((n,a)=>n+(a.actual_ore||0),0);
 const b=accountingReference2025.balance;
 return {year,budget_year:year+1,result,income_ore:complete?sum('income'):null,cost_ore:sum('expense'),result_ore:complete?sum('income')-sum('expense'):null,
  balance:[['1500','Kundefordringer','asset',b.receivables],['1920','Bank','asset',b.bank],['2050','Egenkapital','equity',b.equity],['2400','Leverandørgjeld','liability',b.suppliers],['2990','Annen kortsiktig gjeld','liability',b.otherDebt]].map(([code,name,kind,balance_ore])=>({code,name,kind,balance_ore})),
  assets_ore:b.receivables+b.bank,equity_liabilities_ore:b.equity+b.suppliers+b.otherDebt,
  generated_on:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Oslo'}).format(new Date())};
}
