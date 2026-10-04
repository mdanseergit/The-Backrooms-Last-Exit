import { Router, type IRouter } from "express";
import authRouter from "./auth";
import friendsRouter from "./friends";
import healthRouter from "./health";
import partiesRouter from "./parties";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(friendsRouter);
router.use(partiesRouter);

export default router;
