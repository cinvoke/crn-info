
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CasinocoinAPI } from '@casinocoin/libjs';
import { GetServerInfoResponse } from '@casinocoin/libjs/common/serverinfo';
import { Observable, Subject } from 'rxjs';
import { default as config } from '../../../config';
import { CRNS } from '../interfaces/crn';

@Injectable({
  providedIn: 'root'
})
export class ApiserviceService {

  public API_INFO_URL = config.API_INFO_URL;
  public URL_LAST_CHECK_RELAYNODES = config.URL_LAST_CHECK_RELAYNODES;
  public URL_GET_LEDGER = config.URL_GET_LEDGER;
  public cscAPI: CasinocoinAPI;
  public serverInfo: GetServerInfoResponse;
  public CRNS: any;
  private subject = new Subject<any>();
  private subjectAllCRN = new Subject<any>();
  private subjectArrayCrn = new Subject<any>();

  constructor(
    private httpClient: HttpClient
  ) {
    // define server connection if not yet defined
    if (this.cscAPI === undefined) {
        this.cscAPI = new CasinocoinAPI({ server: config.CSC_SERVER });
    }

    if (!this.cscAPI.isConnected()) {
      // connect to server
      this.cscAPI.connect().then(() => {
        // get all Crn from CasinoCoin
        this.cscAPI.connection.request({ id: 'AccountUpdates', command: 'crn_info' }).then((allCRN: Array<CRNS>) => {
          this.subjectAllCRN.next(allCRN);
        });
        this.cscAPI.on('disconnected', (val) => {
          console.log('Disconecc', val);
          // this.cscAPI = undefined;
        });

      }).catch(error => {
        console.log(JSON.stringify(error));
      });
    }
  }

  getTransactions(): Observable<any> {
      return this.subjectArrayCrn.asObservable();
  }

  getLastCheckRelayNodeChecks() {
    return this.httpClient.get(this.URL_LAST_CHECK_RELAYNODES);
  }

  getRelayNodesServerList() {
    return this.httpClient.get(this.API_INFO_URL);
  }

  getLedger(ledger) {
    return this.httpClient.get(this.URL_GET_LEDGER + ledger);
  }

  getAllCRN(): Observable<any> {
    return this.subjectAllCRN.asObservable();
  }

  async getLedgerInfo(ledger) {
    return await this.cscAPI.getLedger({includeAllData: true, includeTransactions: true, includeState: true, ledgerVersion: ledger});
  }

  async findTransactions(array) {
    if (!array) { return null; }
    for (const hashTransaction of array) {
      if (hashTransaction) {
        try {
          const values: any = await this.cscAPI.getTransaction(hashTransaction);
          if (values) {
            this.subjectArrayCrn.next({
              ledgerVersion: values.specification.LedgerSequence,
              transactionHash: values.id,
              closeTime: values.outcome.timestamp,
              FeesDistributed: values.specification.FeesDistributed,
              crns: values.outcome.balanceChanges
            });
          }
        } catch (error) {
          console.log(`Error get transaction in ${hashTransaction} :`, error);
        }
      }
    }
   }

  WebSocketCRN(url, account) {

    let allInfoCRN: any;
    const connWebSocket: CasinocoinAPI = new CasinocoinAPI({ server: url });
    if (connWebSocket.isConnected()) { connWebSocket.disconnect(); }
      // connect to WebSocket
    connWebSocket.connect().then((value) => {
      // get server info
      connWebSocket.connection.request({ id: 'getInfoWebSocketCRN', command: 'server_info' }).then(data => {
        // console.log('server_info-WebSocket', data);
        if (data) {
          allInfoCRN = data;
        } else {
          this.subject.next('Error');
          connWebSocket.disconnect();
        }
      }).then(() => {
        // get info AccountId
        if (account) {
          connWebSocket.connection.request({ id: 'getInfoAccount', command: 'account_info', account }).then(data => {
            console.log('account_info', data);
            allInfoCRN.info.balance = data.account_data.Balance;
            this.subject.next(allInfoCRN);
          }).then(() => {
            setTimeout(() => {
              if (connWebSocket.isConnected()) {
                connWebSocket.disconnect();
              }
            }, 4000);
          }).catch(error => {
            this.subject.next(allInfoCRN);
            connWebSocket.disconnect();
            console.log(`Error getInfoAccount`, JSON.stringify(error));
          });
        } else {
          this.subject.next(allInfoCRN);
          connWebSocket.disconnect();
        }

      }).catch(error => {
        this.subject.next('Error');
        connWebSocket.disconnect();
        console.log(`Error get Info WebSocketCRN`, JSON.stringify(error));
      });

    })
      .catch(error => {
      connWebSocket.disconnect();
      console.log(`Error Connect with WebSocket ${url}`, JSON.stringify(error));
      return this.subject.next('Error');
    });
  }

  getInfoWebSocketCRN(): Observable<any> {
    return this.subject.asObservable();
  }

}
