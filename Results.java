import org.voltdb.*;

@ProcInfo (
    singlePartition = false
)
public class Results extends VoltProcedure
{
    // Gets the results
    public final SQLStmt resultStmt = new SQLStmt(
	"SELECT COUNT(*) FROM HELLOWORLD;" );

    public VoltTable[] run() {
        voltQueueSQL(resultStmt);
        return voltExecuteSQL(true);
    }
}

