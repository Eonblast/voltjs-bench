import org.voltdb.*;
import org.voltdb.client.*;

public class Client1 {

    public static void main(String[] args) throws Exception {

        /*
        * Instantiate a client and connect to the database.
        */
        org.voltdb.client.Client myApp;
        myApp = ClientFactory.createClient();
        myApp.createConnection("localhost");

        /*
        * Retrieve the message.
        */
        
        final ClientResponse response = myApp.callProcedure("Select", (String) args[0]);
        if (response.getStatus() != ClientResponse.SUCCESS) {
            System.err.println(response.getStatusString());
            System.exit(-1);
        }
        
        final VoltTable results[] = response.getResults();
        
        if (results.length == 0 || results[0].getRowCount() != 1) {
            System.out.printf("I can't say Hello in that language.\n");
            System.exit(-1);
        }
        
        VoltTable resultTable = results[0];
        VoltTableRow row = resultTable.fetchRow(0);
        System.out.printf("%s, %s!\n", row.getString("hello"),
        row.getString("world"));
    }
}