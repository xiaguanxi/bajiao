import android.os.SystemClock;
import android.view.InputEvent;
import android.view.InputDevice;
import android.view.MotionEvent;
public class DeviceTouch {
 public static void main(String[] a) throws Exception {
  Class<?> c=Class.forName("android.hardware.input.InputManager");
  Object im=c.getMethod("getInstance").invoke(null);
  java.lang.reflect.Method inject=c.getMethod("injectInputEvent",InputEvent.class,int.class);
  MotionEvent.PointerProperties p=new MotionEvent.PointerProperties();p.id=0;p.toolType=MotionEvent.TOOL_TYPE_FINGER;
  MotionEvent.PointerCoords xy=new MotionEvent.PointerCoords();xy.x=Float.parseFloat(a[0]);xy.y=Float.parseFloat(a[1]);xy.pressure=1;xy.size=1;
  long t=SystemClock.uptimeMillis();
  for(int action:new int[]{MotionEvent.ACTION_DOWN,MotionEvent.ACTION_UP}){
   MotionEvent e=MotionEvent.obtain(t,SystemClock.uptimeMillis(),action,1,new MotionEvent.PointerProperties[]{p},new MotionEvent.PointerCoords[]{xy},0,0,1,1,0,0,InputDevice.SOURCE_TOUCHSCREEN,0);
   inject.invoke(im,e,2);e.recycle();if(action==0)SystemClock.sleep(80);
  }
 }
}
