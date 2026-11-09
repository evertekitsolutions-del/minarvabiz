"use client";

import {getRuntimeMode} from "@minarvabiz/business-logic";
import {WarehousePanel} from "@minarvabiz/ui";
import {SaasBranchTransferPanel} from "./saas-branch-transfer-panel";

export default function WarehousePage(){
 return getRuntimeMode()==="demo"?<WarehousePanel/>:<SaasBranchTransferPanel/>;
}
